/** Shared by company uploads and PDF rendering; never decodes image pixels. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_EDGE = 4096;
export const MAX_LOGO_PIXELS = 4_000_000;
export const MAX_LOGO_DATA_URL_LENGTH = 4 * Math.ceil(MAX_LOGO_BYTES / 3) + 32;
export const LOGO_REQUIREMENTS = "Logo: PNG lub JPG bez animacji, do 2 MB, maks. 4096 px na bok i 4 mln pikseli.";

export interface LogoMetadata {
  format: "png" | "jpeg";
  width: number;
  height: number;
}

function malformed(): never {
  throw new Error("Nieprawidłowy lub niekompletny plik logo PNG/JPG.");
}

function dimensions(width: number, height: number) {
  if (!width || !height || width > MAX_LOGO_EDGE || height > MAX_LOGO_EDGE || width * height > MAX_LOGO_PIXELS) {
    throw new Error(LOGO_REQUIREMENTS);
  }
  return { width, height };
}

function uint32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function pngCrc(bytes: Uint8Array, start: number, end: number) {
  let crc = 0xffffffff;
  for (let pos = start; pos < end; pos++) crc = crcTable[(crc ^ bytes[pos]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngTextMetadata(bytes: Uint8Array, start: number, end: number, international: boolean) {
  // The PDF decoder searches text separators without checking chunk/array bounds.
  // Keep every required separator inside this chunk's data, excluding its CRC.
  const separator = (position: number) => {
    for (let pos = position; pos < end; pos++) if (bytes[pos] === 0) return pos;
    return malformed();
  };
  const keywordEnd = separator(start);
  if (keywordEnd === start || keywordEnd - start > 79) malformed();
  if (!international) return;
  const flags = keywordEnd + 1;
  if (flags + 2 > end || bytes[flags] > 1 || bytes[flags + 1] !== 0) malformed();
  const languageEnd = separator(flags + 2);
  separator(languageEnd + 1); // Empty language/translated keyword/text are valid.
}

function pngMetadata(bytes: Uint8Array): LogoMetadata {
  // IHDR is first, so reject excessive dimensions before inspecting compressed data.
  if (bytes.length < 33 || uint32(bytes, 8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") malformed();
  const size = dimensions(uint32(bytes, 16), uint32(bytes, 20));
  const depth = bytes[24], color = bytes[25];
  const depths: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!depths[color]?.includes(depth) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) malformed();
  let hasPalette = false, hasData = false, dataEnded = false, dataBytes = 0;
  for (let offset = 8; offset < bytes.length;) {
    if (bytes.length - offset < 12) malformed();
    const length = uint32(bytes, offset), end = offset + 12 + length;
    if (end > bytes.length) malformed();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) malformed();
    if (["acTL", "fcTL", "fdAT"].includes(type)) throw new Error(LOGO_REQUIREMENTS);
    if (pngCrc(bytes, offset + 4, end - 4) !== uint32(bytes, end - 4)) malformed();
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) malformed();
    } else if (type === "PLTE") {
      if (hasPalette || hasData || !length || length % 3 || length > 768 || color === 0 || color === 4 || (color === 3 && length / 3 > 2 ** depth)) malformed();
      hasPalette = true;
    } else if (type === "IDAT") {
      if (dataEnded || (color === 3 && !hasPalette)) malformed();
      hasData = true;
      dataBytes += length;
    } else if (type === "IEND") {
      if (length || !hasData || !dataBytes || end !== bytes.length) malformed();
      return { format: "png", ...size };
    } else {
      // Unknown critical chunks need a decoder we do not support.
      if (type[0] === type[0].toUpperCase()) throw new Error(LOGO_REQUIREMENTS);
      if (type === "tEXt" || type === "iTXt") pngTextMetadata(bytes, offset + 8, end - 4, type === "iTXt");
      if (hasData) dataEnded = true;
    }
    offset = end;
  }
  return malformed();
}

function jpegMetadata(bytes: Uint8Array): LogoMetadata {
  let offset = 2, size: { width: number; height: number } | undefined, components = 0;
  let inScan = false, hasScan = false, hasScanData = false;
  while (offset < bytes.length) {
    if (inScan && bytes[offset] !== 0xff) { hasScanData = true; offset++; continue; }
    if (bytes[offset++] !== 0xff) malformed();
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) malformed();
    const marker = bytes[offset++];
    if (inScan && marker === 0) { hasScanData = true; continue; }
    if (inScan && marker >= 0xd0 && marker <= 0xd7) continue;
    inScan = false;
    if (marker === 0xd9) {
      if (!size || !hasScan || !hasScanData || offset !== bytes.length) malformed();
      return { format: "jpeg", ...size };
    }
    if (marker < 0xc0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > bytes.length) malformed();
    const length = (bytes[offset] << 8) | bytes[offset + 1], end = offset + length;
    if (length < 2 || end > bytes.length) malformed();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (size || length < 8) malformed();
      size = dimensions((bytes[offset + 5] << 8) | bytes[offset + 6], (bytes[offset + 3] << 8) | bytes[offset + 4]);
      components = bytes[offset + 7];
      if (bytes[offset + 2] !== 8 || ![1, 3, 4].includes(components) || length !== 8 + 3 * components) malformed();
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4) {
      throw new Error(LOGO_REQUIREMENTS);
    } else if (marker === 0xda) {
      const scanComponents = bytes[offset + 2];
      if (!size || !scanComponents || scanComponents > components || length !== 6 + 2 * scanComponents) malformed();
      hasScan = true;
      inScan = true;
    }
    offset = end;
  }
  return malformed();
}

export function validateLogoBytes(bytes: Uint8Array, expectedFormat?: LogoMetadata["format"]): LogoMetadata {
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES) throw new Error(LOGO_REQUIREMENTS);
  const isPng = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const isJpeg = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if ((!isPng && !isJpeg) || (expectedFormat === "png" && !isPng) || (expectedFormat === "jpeg" && !isJpeg)) throw new Error(LOGO_REQUIREMENTS);
  return isPng ? pngMetadata(bytes) : jpegMetadata(bytes);
}

export function decodeLogoDataUrl(value: string): { bytes: Uint8Array } & LogoMetadata {
  if (value.length > MAX_LOGO_DATA_URL_LENGTH) throw new Error(LOGO_REQUIREMENTS);
  const comma = value.indexOf(","), prefix = value.slice(0, comma);
  const format = prefix === "data:image/png;base64" ? "png" : ["data:image/jpeg;base64", "data:image/jpg;base64"].includes(prefix) ? "jpeg" : undefined;
  if (!format || comma < 0) throw new Error(LOGO_REQUIREMENTS);
  const encoded = value.slice(comma + 1), padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const decodedLength = encoded.length / 4 * 3 - padding;
  if (decodedLength > MAX_LOGO_BYTES) throw new Error(LOGO_REQUIREMENTS);
  if (!encoded.length || encoded.length % 4 || /[^A-Za-z0-9+/]/.test(encoded.slice(0, encoded.length - padding))) malformed();
  let decoded: string;
  try { decoded = atob(encoded); } catch { return malformed(); }
  // Reject noncanonical padding bits rather than silently changing malformed input.
  if (decoded.length !== decodedLength || btoa(decoded) !== encoded) malformed();
  const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
  return { bytes, ...validateLogoBytes(bytes, format) };
}

export function normalizeLogoUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Pole logoUrl musi być tekstem.");
  if (value.length > MAX_LOGO_DATA_URL_LENGTH) throw new Error(LOGO_REQUIREMENTS);
  const logo = value.trim();
  if (!logo) return null;
  if (logo.startsWith("data:")) {
    decodeLogoDataUrl(logo);
  } else {
    if (logo.length > 2000) throw new Error("Podaj publiczny URL HTTPS logo PNG/JPG (do 2000 znaków, bez loginu i hasła).");
    let url: URL;
    try { url = new URL(logo); } catch { throw new Error("Podaj publiczny URL HTTPS logo PNG/JPG."); }
    if (logo.length > 2000 || url.href.length > 2000 || url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) {
      throw new Error("Podaj publiczny URL HTTPS logo PNG/JPG (do 2000 znaków, bez loginu i hasła).");
    }
  }
  return logo;
}

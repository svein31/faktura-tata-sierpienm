import "server-only";
import { inflate } from "node:zlib";
import { FieldError } from "../api";
import { decodeLogoDataUrl, validateLogoBytes } from "./logo-safety";

type Rows = { count: number; bytes: number };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] as const;

function invalid(): never {
  throw new Error("Nieprawidłowe dane obrazu logo PNG.");
}

/** The exact filtered-byte count for packed pixels, skipping empty Adam7 passes. */
function scanlineRows(width: number, height: number, bitsPerPixel: number, interlace: number): Rows[] {
  if (!interlace) return [{ count: height, bytes: 1 + Math.ceil(width * bitsPerPixel / 8) }];
  return ADAM7.flatMap(([x, y, dx, dy]) => {
    const w = Math.max(0, Math.ceil((width - x) / dx));
    const h = Math.max(0, Math.ceil((height - y) / dy));
    return w && h ? [{ count: h, bytes: 1 + Math.ceil(w * bitsPerPixel / 8) }] : [];
  });
}

/** Native zlib rejects malformed streams before the PDF library's JS PNG decoder.
 * Its allocation is bounded by the already checked image dimensions/depth, not
 * by a compression ratio. Default Z_FINISH also rejects incomplete streams.
 */
function filteredBytes(compressed: Buffer, size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    inflate(compressed, { maxOutputLength: size, info: true }, (error, result) => {
      if (error) { reject(new Error("Nieprawidłowe dane obrazu logo PNG.")); return; }
      // Node's info option returns the native engine along with its output.
      const decoded = result as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
      if (decoded.buffer.length !== size || decoded.engine.bytesWritten !== compressed.length) {
        reject(new Error("Nieprawidłowe dane obrazu logo PNG.")); return;
      }
      resolve(decoded.buffer);
    });
  });
}

/** Validate stored/fetched PNGs and remove metadata unused by PDF rendering.
 * The retained IHDR, palette, transparency and IDAT bytes preserve image pixels.
 * Original upload/storage bytes are never changed. This module is server-only.
 */
export async function preparePngForEmbedding(bytes: Uint8Array): Promise<Uint8Array> {
  const { width, height } = validateLogoBytes(bytes, "png");
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const depth = input[24], color = input[25];
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
  const rows = scanlineRows(width, height, depth * channels, input[28]);
  const size = rows.reduce((sum, row) => sum + row.count * row.bytes, 0);
  const retained = [input.subarray(0, 8)];
  const data: Buffer[] = [];
  let paletteEntries = 0, hasData = false, hasTransparency = false;
  for (let offset = 8; offset < input.length;) {
    const length = input.readUInt32BE(offset), end = offset + length + 12;
    const type = input.toString("ascii", offset + 4, offset + 8);
    if (type === "PLTE") {
      if (hasTransparency) invalid();
      paletteEntries = length / 3;
    } else if (type === "tRNS") {
      if (hasTransparency || hasData) invalid();
      hasTransparency = true;
      if (color === 3) { if (!paletteEntries || length > paletteEntries) invalid(); }
      else if (color === 0 || color === 2) {
        if (length !== (color === 0 ? 2 : 6)) invalid();
        for (let position = offset + 8; position < end - 4; position += 2) {
          if (input.readUInt16BE(position) >= 2 ** depth) invalid();
        }
      } else invalid();
    } else if (type === "IDAT") {
      hasData = true;
      data.push(input.subarray(offset + 8, end - 4));
    }
    if (["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type)) retained.push(input.subarray(offset, end));
    offset = end;
  }
  const decoded = await filteredBytes(Buffer.concat(data), size);
  let offset = 0;
  for (const row of rows) {
    for (let count = 0; count < row.count; count++, offset += row.bytes) {
      if (decoded[offset] > 4) invalid();
    }
  }
  // Do not expose a pooled Buffer's offset/extra bytes to the downstream decoder.
  return Uint8Array.from(Buffer.concat(retained));
}

/** Profile writes check inline PNGs without changing storage or fetching remote URLs. */
export async function validateInlineLogoForStorage(logoUrl: string | null | undefined): Promise<void> {
  if (!logoUrl?.startsWith("data:image/png;base64,")) return;
  try { await preparePngForEmbedding(decodeLogoDataUrl(logoUrl).bytes); }
  catch { throw new FieldError("logoUrl", "Nieprawidłowe dane obrazu logo PNG."); }
}

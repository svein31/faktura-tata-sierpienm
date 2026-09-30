/** ZIP with stored entries, UTF-8 names and CRC32; no external runtime dependency. */
export function zipFiles(files: { name: string; data: Uint8Array | string }[]) {
  const chunks: Buffer[] = [], directory: Buffer[] = []; let offset = 0;
  const crc32 = (data: Buffer) => { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
  const names = new Set<string>();
  for (const file of files) {
    if (!file.name || file.name.startsWith("/") || file.name.includes("..") || file.name.includes("\\") || names.has(file.name)) throw new Error("Nieprawidłowa lub powtórzona nazwa w ZIP.");
    names.add(file.name);
    const name = Buffer.from(file.name, "utf8"), data = typeof file.data === "string" ? Buffer.from(file.data, "utf8") : Buffer.from(file.data), crc = crc32(data);
    if (name.length > 65535 || data.length + offset > 32_000_000 || files.length > 1000) throw new Error("Paczka przekracza limit 32 MB.");
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    chunks.push(header, name, data); directory.push(central, name); offset += header.length + name.length + data.length;
  }
  const centralSize = directory.reduce((s, b) => s + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...directory, end]);
}

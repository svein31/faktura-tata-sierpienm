const {deflateRawSync}=require('node:zlib');
const {spreadsheet}=require('../../src/lib/xlsx.ts');
/** Real OOXML with DEFLATE parts, matching files saved by Excel/LibreOffice. */
exports.catalogWorkbook=rows=>{
 const stored=spreadsheet(rows),chunks=[],directory=[];let at=0,offset=0,count=0;
 while(stored.readUInt32LE(at)===0x04034b50){
  const nameLength=stored.readUInt16LE(at+26),length=stored.readUInt32LE(at+18),crc=stored.readUInt32LE(at+14),name=stored.subarray(at+30,at+30+nameLength),raw=stored.subarray(at+30+nameLength,at+30+nameLength+length),compressed=deflateRawSync(raw);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(raw.length,22);header.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  chunks.push(header,name,compressed);directory.push(central,name);offset+=header.length+name.length+compressed.length;at+=30+nameLength+length;count++;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(directory.reduce((sum,b)=>sum+b.length,0),12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,...directory,end]);
};

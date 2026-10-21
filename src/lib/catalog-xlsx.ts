import { inflateRawSync } from "node:zlib";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ApiError } from "@/lib/api";

function fail(message = "Nieprawidłowy plik Excel. Zapisz go ponownie jako .xlsx lub CSV."): never { throw new ApiError(400, message); }
const MAX_XML = 4_000_000, MAX_EXPANDED = 12_000_000;
const crc32 = (data: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
};

/** Read bounded OOXML parts in memory. No extraction, external links or macro execution. */
function xlsxParts(bytes: Buffer) {
  if (bytes.length < 22 || bytes.length > 2_000_000) fail("Plik Excel może mieć najwyżej 2 MB.");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) fail();
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (!count || count > 200 || count !== bytes.readUInt16LE(end + 8) || start + size !== end) fail();
  const parts = new Map<string, Buffer>();
  let at = start, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== 0x02014b50) fail();
    const flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10), crc = bytes.readUInt32LE(at + 16);
    const compressed = bytes.readUInt32LE(at + 20), length = bytes.readUInt32LE(at + 24), nameLength = bytes.readUInt16LE(at + 28);
    const next = at + 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32), local = bytes.readUInt32LE(at + 42);
    if (next > end || local + 30 > start || flags & 1 || ![0, 8].includes(method) || length > MAX_XML || (expanded += length) > MAX_EXPANDED) fail("Plik Excel jest zaszyfrowany, zbyt duży po rozpakowaniu lub ma nieobsługiwany format.");
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..") || parts.has(name)) fail();
    if (bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 6) !== flags) fail();
    const localName = bytes.readUInt16LE(local + 26), dataStart = local + 30 + localName + bytes.readUInt16LE(local + 28);
    if (dataStart + compressed > start || bytes.subarray(local + 30, local + 30 + localName).toString("utf8") !== name) fail();
    let value: Buffer;
    try { value = method === 0 ? bytes.subarray(dataStart, dataStart + compressed) : inflateRawSync(bytes.subarray(dataStart, dataStart + compressed), { maxOutputLength: Math.max(1, length) }); }
    catch { fail(); }
    if (value.length !== length || crc32(value) !== crc) fail("Plik Excel jest uszkodzony. Zapisz go ponownie i spróbuj jeszcze raz.");
    parts.set(name, value); at = next;
  }
  if (at !== end || [...parts.keys()].some(name => /vbaProject\.bin$/i.test(name))) fail("Import obsługuje pliki .xlsx bez makr.");
  return parts;
}
function asArray<T>(value: T | T[] | undefined): T[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
function plainText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  if ("#text" in node) return plainText(node["#text"]);
  if ("t" in node) return plainText(node.t);
  return asArray(node.r).map(plainText).join("");
}
export function parseCatalogXlsx(bytes: Buffer, sheetIndex = 0) {
  const parts = xlsxParts(bytes);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: false, processEntities: true });
  const xml = (name: string) => {
    const source = parts.get(name)?.toString("utf8");
    if (!source || /<!\s*(?:DOCTYPE|ENTITY)/i.test(source) || XMLValidator.validate(source) !== true) fail();
    try { return parser.parse(source); } catch { fail(); }
  };
  const sheets = asArray(xml("xl/workbook.xml").workbook?.sheets?.sheet) as { "@name": string; "@id": string }[];
  if (!sheets.length || sheets.length > 20 || !Number.isInteger(sheetIndex) || sheetIndex < 0 || sheetIndex >= sheets.length) fail("Wybierz istniejący arkusz (maksymalnie 20 arkuszy w pliku).");
  const links = asArray(xml("xl/_rels/workbook.xml.rels").Relationships?.Relationship) as { "@Id": string; "@Target": string; "@TargetMode"?: string; "@Type": string }[];
  const link = links.find(value => value["@Id"] === sheets[sheetIndex]["@id"] && value["@Type"]?.endsWith("/worksheet") && value["@TargetMode"] !== "External");
  if (!link) fail();
  const target = link["@Target"].startsWith("/") ? link["@Target"].slice(1) : "xl/" + link["@Target"].replace(/^\.\//, "");
  if (!/^xl\/worksheets\/[^/]+\.xml$/.test(target)) fail();
  const shared = parts.has("xl/sharedStrings.xml") ? asArray(xml("xl/sharedStrings.xml").sst?.si).map(plainText) : [];
  const styles = parts.has("xl/styles.xml") ? xml("xl/styles.xml").styleSheet : null;
  const customFormats = new Map((asArray(styles?.numFmts?.numFmt) as { "@numFmtId": string; "@formatCode": string }[]).map(format => [Number(format["@numFmtId"]), format["@formatCode"]]));
  const cellStyles = asArray(styles?.cellXfs?.xf) as { "@numFmtId": string }[];
  const dateStyle = (index: number) => {
    const format = Number(cellStyles[index]?.["@numFmtId"] || 0);
    if ((format >= 14 && format <= 22) || (format >= 27 && format <= 36) || (format >= 45 && format <= 47) || (format >= 50 && format <= 58)) return true;
    return /[ymdhs]/i.test((customFormats.get(format) || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""));
  };
  const worksheet = xml(target).worksheet;
  const rows: string[][] = [];
  for (const row of asArray(worksheet?.sheetData?.row) as { c?: { "@r"?: string; "@t"?: string; "@s"?: string; f?: unknown; v?: unknown; is?: unknown }[] }[]) {
    const cells: string[] = [];
    for (const cell of asArray(row.c)) {
      if (cell.f !== undefined) fail("Arkusz zawiera formuły. Skopiuj dane i wklej jako wartości przed importem.");
      const ref = cell["@r"]?.match(/^([A-Z]{1,3})\d+$/);
      if (!ref) fail();
      const column = [...ref[1]].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const type = cell["@t"], raw = plainText(cell.v);
      if (raw && (!type || type === "n") && dateStyle(Number(cell["@s"] || 0))) fail("Arkusz zawiera komórkę z datą lub godziną. Zapisz potrzebne kolumny jako tekst lub liczby; daty nie są przeliczane na ceny.");
      if (type && !["s", "inlineStr", "n", "str", "e"].includes(type)) fail("Arkusz zawiera datę, wartość logiczną lub nieobsługiwany typ komórki. Przygotuj kolumny jako tekst lub liczby.");
      let value = type === "inlineStr" ? plainText(cell.is) : raw;
      if (type === "s") {
        if (!/^\d+$/.test(raw) || shared[Number(raw)] === undefined) fail();
        value = shared[Number(raw)];
      }
      if (type === "e") fail("Arkusz zawiera błąd komórki. Popraw go przed importem.");
      if (value.length > 1000) fail("Komórka przekracza 1000 znaków.");
      if (column >= 30 && value.trim()) fail("Arkusz może zawierać najwyżej 30 kolumn danych.");
      if (column < 30) cells[column] = value.trim();
    }
    if (cells.some(Boolean)) rows.push(cells);
    if (rows.length > 201) fail("Import może mieć najwyżej 200 wierszy danych. Podziel arkusz na mniejsze pliki.");
  }
  const width = Math.max(0, ...rows.map(row => row.length));
  const normalized = rows.map(row => Array.from({ length: width }, (_, i) => row[i] || ""));
  return { headers: normalized[0] || [], rows: normalized.slice(1), sheets: sheets.map(sheet => sheet["@name"]), sheetIndex };
}

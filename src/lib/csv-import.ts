/** RFC 4180 style CSV (semicolon, comma or tab), including quoted line breaks. */
export function parseImportCsv(text: string): { headers: string[]; rows: string[][] } {
  if (text.length > 262144) throw new Error("Plik przekracza 256 KB.");
  const source = text.replace(/^\uFEFF/, "");
  let separator = ";", quoted = false;
  const counts = { ";": 0, ",": 0, "\t": 0 };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') { if (quoted && source[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char in counts) counts[char as keyof typeof counts]++;
  }
  if (counts[","] > counts[";"] && counts[","] >= counts["\t"]) separator = ",";
  if (counts["\t"] > counts[";"] && counts["\t"] > counts[","]) separator = "\t";
  const records: string[][] = [];
  let current = "", line: string[] = [];
  quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { current += '"'; i++; }
      else if (!quoted && current === "") quoted = true;
      else if (quoted) quoted = false;
      else throw new Error("Nieprawidłowy cudzysłów w pliku CSV.");
    } else if (!quoted && char === separator) { line.push(current.trim()); current = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) {
      line.push(current.trim()); if (line.some(Boolean)) records.push(line);
      line = []; current = ""; if (char === "\r" && source[i + 1] === "\n") i++;
      if (records.length > 201) throw new Error("Import może mieć najwyżej 200 wierszy.");
    } else current += char;
  }
  if (quoted) throw new Error("Niezamknięte pole w cudzysłowie.");
  line.push(current.trim()); if (line.some(Boolean)) records.push(line);
  if (records.length < 2 || records.length > 201) throw new Error("Plik musi zawierać nagłówek oraz od 1 do 200 wierszy.");
  const [headers, ...rows] = records;
  if (headers.length > 30 || rows.some(row => row.length !== headers.length)) throw new Error("Wiersze CSV mają różną liczbę kolumn.");
  return { headers, rows };
}

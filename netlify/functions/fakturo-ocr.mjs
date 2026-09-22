export const config = { schedule: "* * * * *" };
export default async function () {
  if (!process.env.OCR_SPACE_API_KEY) return new Response(null, { status: 204 });
  const base = process.env.APP_URL || process.env.URL;
  if (!base || !process.env.CRON_SECRET) throw new Error("OCR schedule requires APP_URL and CRON_SECRET.");
  const url = new URL("/api/documents/process", base);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid OCR schedule URL.");
  const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(25000), redirect: "error" });
  if (!response.ok) throw new Error(`OCR worker returned HTTP ${response.status}.`);
  return new Response(null, { status: 204 });
}

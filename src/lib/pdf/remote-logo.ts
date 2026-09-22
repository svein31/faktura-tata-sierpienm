import { resolve4 } from "node:dns/promises";
import { isIPv4 } from "node:net";
import { request } from "node:https";
import { publicIpv4, webhookUrl } from "@/lib/integration-security";

/** Bound public HTTPS images; pin DNS and reject redirects/private addresses. */
export async function remoteLogo(value: string): Promise<{ bytes: Buffer; isPng: boolean }> {
  const url = webhookUrl(value);
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = isIPv4(url.hostname) ? [url.hostname] : await Promise.race([
    resolve4(url.hostname), new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new Error("Logo DNS timeout")), 3000); }),
  ]).finally(() => { if (dnsTimer) clearTimeout(dnsTimer); });
  if (!addresses.length || addresses.some(ip => !publicIpv4(ip))) throw new Error("Logo wymaga publicznego adresu HTTPS.");
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", agent: false, family: 4,
      lookup: ((_hostname: string, _options: unknown, callback: (error: Error | null, address: string, family: number) => void) => callback(null, addresses[0], 4)) as any,
      headers: { Accept: "image/png,image/jpeg" },
    }, response => {
      const mime = response.headers["content-type"]?.split(";")[0];
      if (response.statusCode !== 200 || !["image/png", "image/jpeg"].includes(mime || "")) { response.destroy(); reject(new Error("Logo musi być obrazem PNG/JPG bez przekierowania.")); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { response.destroy(new Error("Logo przekracza 2 MB.")); return; }
        chunks.push(chunk);
      });
      response.once("error", reject);
      response.once("end", () => resolve({ bytes: Buffer.concat(chunks), isPng: mime === "image/png" }));
    });
    const timeout = setTimeout(() => req.destroy(new Error("Logo timeout")), 5000);
    req.once("close", () => clearTimeout(timeout)); req.once("error", reject); req.end();
  });
}

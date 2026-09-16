import { resolve4 } from "node:dns/promises";
import { isIPv4 } from "node:net";
import { request } from "node:https";
import { publicIpv4, webhookUrl } from "./integration-security";
export async function sendWebhook(urlValue: string, body: string, headers: Record<string, string>) {
  const url = webhookUrl(urlValue);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = isIPv4(url.hostname) ? [url.hostname] : await Promise.race([
    resolve4(url.hostname), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS timeout")), 3000); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
  if (!addresses.length || addresses.some(ip => !publicIpv4(ip))) throw new Error("Webhook wymaga publicznego adresu IPv4.");
  // Pin the validated address: HTTPS still validates the original hostname. Never follow redirects.
  await new Promise<void>((resolve, reject) => {
    const req = request(url, { method: "POST", agent: false, family: 4,
      lookup: ((_hostname: string, _options: unknown, callback: (error: Error | null, address: string, family: number) => void) => callback(null, addresses[0], 4)) as any,
      headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)), ...headers } }, res => {
        const status = res.statusCode || 0;
        res.destroy();
        if (status >= 200 && status < 300) resolve(); else reject(new Error(`HTTP ${status}`));
      });
    const timeout = setTimeout(() => req.destroy(new Error("Webhook timeout")), 10000);
    req.once("close", () => clearTimeout(timeout)); req.once("error", reject); req.end(body);
  });
}

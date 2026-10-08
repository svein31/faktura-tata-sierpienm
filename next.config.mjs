import { execFileSync } from "node:child_process";

// Freeze the source revision at build time so smoke checks cannot accept an older deploy.
let sourceRevision = process.env.COMMIT_REF || process.env.GITHUB_SHA || "";
if (!sourceRevision) {
  try { sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* Source archives may omit Git metadata. */ }
}
const buildRevision = /^[a-f0-9]{40}$/i.test(sourceRevision) ? sourceRevision : "unknown";

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
  // Roll out script restrictions after collecting compatibility reports for Next hydration.
  { key: "Content-Security-Policy-Report-Only", value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; object-src 'none'" },
];
const privatePages = ["accountant", "advances", "analytics", "audit", "calendar", "contractors", "cost-reviews", "dashboard", "documents", "expenses", "finances", "help", "invoices", "jpk", "ksef", "offers", "orders", "products", "projects", "recurring", "reminders", "settings", "tax-estimate", "warehouse", "portal", "login", "register", "forgot-password", "reset-password", "verify-email", "invite"];
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  httpAgentOptions: { keepAlive: true },
  // Next 15: eliminate the stylesheet round trip on statically rendered pages.
  experimental: { inlineCss: true },
  images: { formats: ["image/avif", "image/webp"], minimumCacheTTL: 86400 },
  env: { APP_BUILD_REVISION: buildRevision },
  outputFileTracingIncludes: {"/*": ["./public/fonts/*.ttf"]},
  async headers() { return [
    { source: "/:path*", headers: securityHeaders },
    { source: "/portal/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    { source: "/api/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Netlify-CDN-Cache-Control", value: "private, no-store" },
    ] },
    { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }] },
    ...privatePages.map(path => ({ source: `/${path}/:path*`, headers: [
      { key: "Netlify-CDN-Cache-Control", value: "private, no-store" },
    ] })),
  ]; },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;

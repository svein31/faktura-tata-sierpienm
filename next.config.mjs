/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {"/*": ["./public/fonts/*.ttf"]},
  async headers() { return [{ source: "/portal/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] }]; },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;


import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN } from "@/lib/seo/content";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/portal/", "/dashboard/", "/settings/"] },
    sitemap: `${PUBLIC_ORIGIN}/sitemap.xml`,
  };
}

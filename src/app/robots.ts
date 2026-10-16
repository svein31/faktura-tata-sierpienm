import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN } from "@/lib/seo/content";
import { PRIVATE_CRAWL_RULES } from "@/lib/seo/discovery";

export default function robots(): MetadataRoute.Robots {
  return {
    // A single group also applies to Googlebot, Bingbot and OAI-SearchBot.
    // Separate allow-only AI groups would silently override the private exclusions.
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_CRAWL_RULES },
    sitemap: `${PUBLIC_ORIGIN}/sitemap.xml`,
  };
}

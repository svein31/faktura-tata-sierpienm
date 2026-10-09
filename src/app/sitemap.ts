import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN } from "@/lib/seo/content";
import { contentModifiedAt, INDEXABLE_PATHS } from "@/lib/seo/discovery";

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PATHS.map(path => ({
    url: new URL(path, PUBLIC_ORIGIN).toString(),
    ...(contentModifiedAt(path) ? { lastModified: new Date(`${contentModifiedAt(path)}T12:00:00Z`) } : {}),
    changeFrequency: path === "/" ? "weekly" : "monthly",
  }));
}

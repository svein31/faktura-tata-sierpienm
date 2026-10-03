import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN, REVIEW_DATE, topics } from "@/lib/seo/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/cennik", "/demo", "/pomoc", "/program-do-faktur", "/porownania", "/faktury", "/poradnik-ksef", "/vat", "/narzedzia", "/narzedzia/kalkulator-vat", "/narzedzia/limit-ksef", "/regulamin", "/polityka-prywatnosci", "/polityka-cookies", "/powierzenie-danych", "/podwykonawcy", ...topics.map(topic => topic.path)];
  return pages.map(path => ({
    url: new URL(path, PUBLIC_ORIGIN).toString(),
    ...(["/faktury", "/poradnik-ksef", "/vat", "/narzedzia", "/program-do-faktur", "/porownania"].some(section => path === section || path.startsWith(`${section}/`)) ? { lastModified: new Date(`${topics.find(topic => topic.path === path)?.modifiedAt || (["/poradnik-ksef", "/program-do-faktur", "/porownania", "/faktury", "/narzedzia"].includes(path) ? "2026-10-02" : REVIEW_DATE)}T12:00:00Z`) } : {}),
    changeFrequency: path === "/" ? "weekly" : "monthly",
  }));
}

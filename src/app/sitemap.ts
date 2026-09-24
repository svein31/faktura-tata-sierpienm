import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN, REVIEW_DATE, topics } from "@/lib/seo/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/demo", "/pomoc", "/program-do-faktur", "/faktury", "/poradnik-ksef", "/vat", "/narzedzia", "/narzedzia/kalkulator-vat", "/narzedzia/limit-ksef", "/regulamin", "/polityka-prywatnosci", "/polityka-cookies", "/powierzenie-danych", "/podwykonawcy", ...topics.map(topic => topic.path)];
  return pages.map(path => ({
    url: new URL(path, PUBLIC_ORIGIN).toString(),
    ...(["/faktury", "/poradnik-ksef", "/vat", "/narzedzia", "/program-do-faktur"].some(section => path === section || path.startsWith(`${section}/`)) ? { lastModified: new Date(`${REVIEW_DATE}T12:00:00Z`) } : {}),
    changeFrequency: path === "/" ? "weekly" : "monthly",
  }));
}

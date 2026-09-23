import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = "https://fakturaprosto.pl";
  return ["/", "/demo", "/pomoc", "/regulamin", "/polityka-prywatnosci", "/polityka-cookies", "/powierzenie-danych", "/podwykonawcy"].map(path => ({
    url: new URL(path, origin).toString(),
    changeFrequency: path === "/" ? "weekly" : "monthly",
  }));
}

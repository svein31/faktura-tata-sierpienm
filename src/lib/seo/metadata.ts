import type { Metadata } from "next";
import { PUBLIC_ORIGIN } from "./content";

const origin = PUBLIC_ORIGIN;
export function publicMetadata(
  path: string, title: string, description: string
): Metadata {
  return {
    metadataBase: new URL(origin),
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true, "max-image-preview": "large" },
    openGraph: {
      title, description, url: path, type: "website",
      siteName: "FakturaProsto", locale: "pl_PL",
      images: [{ url: origin + "/opengraph-image",
        width: 1200, height: 630, alt: "FakturaProsto — faktury online i KSeF 2.0" }]
    },
    twitter: {
      card: "summary_large_image", title, description,
      images: [origin + "/opengraph-image"]
    }
  };
}


import onpage from "./onpage.json";
export function pageMetadata(path: string, fallbackTitle = "FakturaProsto", fallbackDescription = "Faktury online i KSeF 2.0.") {
  const copy = onpage.find(page => page.url === path);
  return publicMetadata(path, copy?.title || fallbackTitle.slice(0, 60), copy?.description || fallbackDescription.slice(0, 155));
}
export function pageCopy(path: string) { return onpage.find(page => page.url === path); }

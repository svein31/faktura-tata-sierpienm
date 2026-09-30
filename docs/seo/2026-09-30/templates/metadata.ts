import type { Metadata } from "next";

const origin = "https://fakturaprosto.pl";
export function publicMetadata(
  path: string, title: string, description: string
): Metadata {
  return {
    metadataBase: new URL(origin),
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true, maxImagePreview: "large" },
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

// W src/app/program-do-faktur/page.tsx:
// export const metadata = publicMetadata(
//   "/program-do-faktur",
//   "Darmowy program do faktur: 5 miesięcznie | FakturaProsto",
//   "Szukasz darmowego programu do faktur? Free obejmuje 5 faktur miesięcznie. Poznaj KSeF 2.0, porównaj plany i sprawdź demo bez rejestracji."
// );

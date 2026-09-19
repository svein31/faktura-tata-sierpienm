import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "FakturaProsto", short_name: "FakturaProsto", description: "Faktury, dokumenty i współpraca z księgowością", start_url: "/dashboard", scope: "/", display: "standalone", background_color: "#07090e", theme_color: "#07090e", lang: "pl", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] };
}

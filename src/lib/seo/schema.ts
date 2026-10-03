import { PUBLIC_ORIGIN } from "./content";
import { SUBSCRIPTION_PLANS } from "../subscription-plans";

export const publisherSchema = {
  "@type": "Organization",
  "@id": `${PUBLIC_ORIGIN}/#organization`,
  name: "FakturaProsto",
  url: PUBLIC_ORIGIN,
  logo: `${PUBLIC_ORIGIN}/icon.svg`,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    url: `${PUBLIC_ORIGIN}/pomoc`,
    availableLanguage: "Polish",
  },
};

export const websiteSchema = {
  "@type": "WebSite",
  "@id": `${PUBLIC_ORIGIN}/#website`,
  name: "FakturaProsto",
  url: PUBLIC_ORIGIN,
  inLanguage: "pl-PL",
  publisher: { "@id": publisherSchema["@id"] },
};

export const softwareSchema = {
  "@type": "SoftwareApplication",
  "@id": `${PUBLIC_ORIGIN}/#software`,
  name: "FakturaProsto",
  url: `${PUBLIC_ORIGIN}/program-do-faktur`,
  description: "Program do wystawiania faktur online. Plan Free obejmuje do 5 faktur miesięcznie.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "pl-PL",
  publisher: { "@id": publisherSchema["@id"] },
  offers: [
    { "@type": "Offer", price: "0", priceCurrency: "PLN", description: "Plan Free: do 5 faktur miesięcznie", url: `${PUBLIC_ORIGIN}/cennik#free` },
    ...SUBSCRIPTION_PLANS.map(plan => ({
      "@type": "Offer",
      price: String(plan.amountPln),
      priceCurrency: "PLN",
      description: `Pro: ${plan.amountPln} zł brutto za ${plan.period}`,
      url: `${PUBLIC_ORIGIN}/cennik#${plan.id}`,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: String(plan.amountPln),
        priceCurrency: "PLN",
        valueAddedTaxIncluded: true,
        billingDuration: plan.id === "yearly" ? "P1Y" : "P1M",
      },
    })),
  ],
};

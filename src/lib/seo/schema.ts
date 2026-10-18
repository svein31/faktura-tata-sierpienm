import { PUBLIC_ORIGIN, topicCategory, topicDates, type Topic } from "./content";
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

export const productVideoSchema = {
  "@type": "VideoObject",
  "@id": `${PUBLIC_ORIGIN}/#product-video`,
  name: "FakturaProsto — od pierwszego szkicu do porządku w finansach",
  description: "Film demonstracyjny: profil firmy, szkic faktury, podgląd PDF, korekta i terminarz. Rzeczywisty interfejs na danych demonstracyjnych, bez wysyłki do KSeF.",
  thumbnailUrl: `${PUBLIC_ORIGIN}/media/fakturaprosto-demo.webp`,
  contentUrl: `${PUBLIC_ORIGIN}/media/fakturaprosto-demo.mp4`,
  uploadDate: "2026-10-18T00:00:00Z",
  duration: "PT1M9.8S",
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

export const editorialSchema = {
  "@type": "Organization",
  "@id": `${PUBLIC_ORIGIN}/#editorial`,
  name: "Redakcja FakturaProsto",
  url: `${PUBLIC_ORIGIN}/pomoc`,
};

export function breadcrumbSchema(path: string, items: { path: string; name: string }[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${PUBLIC_ORIGIN}${path}#breadcrumbs`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem", position: index + 1, name: item.name,
      item: new URL(item.path, PUBLIC_ORIGIN).href,
    })),
  };
}

export function topicSchema(topic: Topic) {
  const canonical = PUBLIC_ORIGIN + topic.path;
  const category = topicCategory(topic.path);
  const dates = topicDates(topic);
  const citations = [...new Set([
    ...topic.sources.map(source => source.url),
    ...topic.sections.flatMap(section => section.source ? [section.source.url] : []),
  ])];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage", "@id": `${canonical}#page`, url: canonical,
        name: topic.title, description: topic.description,
        isPartOf: { "@id": websiteSchema["@id"] }, inLanguage: "pl-PL",
        mainEntity: { "@id": `${canonical}#article` },
        breadcrumb: { "@id": `${canonical}#breadcrumbs` },
      },
      {
        "@type": "Article", "@id": `${canonical}#article`,
        headline: topic.title, description: topic.description, abstract: topic.answer,
        mainEntityOfPage: { "@id": `${canonical}#page` },
        author: editorialSchema, publisher: { "@id": publisherSchema["@id"] },
        datePublished: dates.publishedAt, dateModified: dates.modifiedAt,
        inLanguage: "pl-PL", articleSection: category.name,
        citation: citations, image: `${PUBLIC_ORIGIN}/opengraph-image`,
        hasPart: topic.sections.map((section, index) => ({
          "@type": "WebPageElement", name: section.title,
          "@id": `${canonical}#sekcja-${index + 1}`,
          url: `${canonical}#sekcja-${index + 1}`,
        })),
      },
      breadcrumbSchema(topic.path, [
        { path: "/", name: "Start" }, category,
        { path: topic.path, name: topic.title },
      ]),
      ...(topic.path === "/faktury/jak-wystawic" ? [{
        "@type": "HowTo", "@id": `${canonical}#howto`,
        name: topic.title, description: topic.answer,
        step: topic.sections.map((section, index) => ({
          "@type": "HowToStep", position: index + 1, name: section.title,
          text: section.body, url: `${canonical}#sekcja-${index + 1}`,
        })),
      }] : []),
    ],
  };
}

export function collectionSchema(path: string, name: string, description: string, items: Pick<Topic, "path" | "title">[]) {
  const canonical = PUBLIC_ORIGIN + path;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage", "@id": `${canonical}#page`,
        url: canonical, name, description, inLanguage: "pl-PL",
        isPartOf: { "@id": websiteSchema["@id"] },
        mainEntity: { "@id": `${canonical}#topics` },
      },
      {
        "@type": "ItemList", "@id": `${canonical}#topics`,
        numberOfItems: items.length,
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem", position: index + 1,
          name: item.title, url: PUBLIC_ORIGIN + item.path,
        })),
      },
    ],
  };
}

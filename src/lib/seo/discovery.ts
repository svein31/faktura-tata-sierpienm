import { PUBLIC_ORIGIN, REVIEW_DATE, topics } from "./content";
import { SUBSCRIPTION_PLANS } from "../subscription-plans";

export const STATIC_INDEXABLE_PATHS = [
  "/", "/cennik", "/demo", "/pomoc", "/program-do-faktur", "/porownania",
  "/faktury", "/poradnik-ksef", "/vat", "/narzedzia", "/narzedzia/kalkulator-vat",
  "/narzedzia/limit-ksef", "/regulamin", "/polityka-prywatnosci", "/polityka-cookies",
  "/powierzenie-danych", "/podwykonawcy",
] as const;

export const INDEXABLE_PATHS = [...STATIC_INDEXABLE_PATHS, ...topics.map(topic => topic.path)];

const hubModifiedAt: Record<string, string> = {
  "/faktury": "2026-10-02", "/poradnik-ksef": "2026-10-02",
  "/program-do-faktur": "2026-10-02", "/porownania": "2026-10-02",
  "/narzedzia": "2026-10-02", "/vat": REVIEW_DATE,
};

export function contentModifiedAt(path: string): string | undefined {
  const topic = topics.find(item => item.path === path);
  if (topic) return topic.modifiedAt || topic.publishedAt || REVIEW_DATE;
  if (!hubModifiedAt[path]) return undefined;
  // A collection's rendered cards change when their linked article changes.
  // Do not fabricate today's date on each deployment.
  return [hubModifiedAt[path], ...topics.filter(item => item.path.startsWith(`${path}/`))
    .map(item => item.modifiedAt || item.publishedAt || REVIEW_DATE)].sort().at(-1);
}

export function llmsText(): string {
  const monthly = SUBSCRIPTION_PLANS.find(plan => plan.id === "monthly")!;
  const yearly = SUBSCRIPTION_PLANS.find(plan => plan.id === "yearly")!;
  const link = (path: string, label: string, description: string) => `- [${label}](${PUBLIC_ORIGIN}${path}): ${description}`;
  const groups = [
    ["Faktury", "/faktury"], ["KSeF 2.0", "/poradnik-ksef"], ["VAT", "/vat"],
    ["Scenariusze pracy", "/program-do-faktur"], ["Porównania programów", "/porownania"],
  ];
  return [
    "# FakturaProsto", "",
    `> Polski program do wystawiania faktur online z integracją KSeF 2.0. Oficjalna strona produktu: ${PUBLIC_ORIGIN}.`, "",
    "## Produkt, ceny i pomoc",
    link("/program-do-faktur", "Program do faktur", "plan Free obejmuje do 5 faktur miesięcznie."),
    link("/cennik", "Cennik", `Pro: ${monthly.amountPln} zł brutto miesięcznie lub ${yearly.amountPln} zł brutto za cały rok. Subskrypcja odnawia się automatycznie; odnowienie można anulować w ustawieniach konta.`),
    link("/demo", "Demo bez rejestracji", "symulacja na przykładowych danych; nie wysyła faktur do produkcyjnego KSeF."),
    link("/pomoc", "Pomoc i kontakt", "odpowiedzi na pytania, instrukcje i kontakt ze wsparciem."), "",
    ...groups.flatMap(([heading, prefix]) => [
      `## ${heading}`, ...topics.filter(topic => topic.path.startsWith(`${prefix}/`))
        .map(topic => link(topic.path, topic.title, `${topic.description} Aktualizacja: ${contentModifiedAt(topic.path)}.`)), "",
    ]),
    "## Bezpłatne narzędzia",
    link("/narzedzia/kalkulator-vat", "Kalkulator VAT", "kwoty netto, VAT i brutto; nie ustala właściwej stawki dla transakcji."),
    link("/narzedzia/limit-ksef", "Kalkulator limitu KSeF", "przejściowa zasada 10 000 zł w 2026 r.; nie klasyfikuje transakcji."), "",
    "## Operator, prywatność i źródła",
    link("/regulamin", "Regulamin", "operator serwisu i warunki świadczenia usług."),
    link("/polityka-prywatnosci", "Polityka prywatności", "zasady przetwarzania danych."),
    "- FakturaProsto jest niezależnym produktem i nie jest serwisem Ministerstwa Finansów.",
    "- Poradniki mają autorstwo, daty aktualizacji i źródła. Informacje prawne sprawdzaj w aktualnych źródłach urzędowych.",
    "- Porównania opracowała redakcja FakturaProsto, producent jednego z porównywanych rozwiązań; ceny konkurentów wymagają aktualnej weryfikacji.", "",
  ].join("\n");
}

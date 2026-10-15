/**
 * src/lib/legal/config.ts
 * 
 * Konfiguracja systemu prawnego, metadanych operatora, wersji dokumentów,
 * inwentarza plików cookies oraz wykazu podwykonawców (podprocesorów)
 * dla serwisu FakturaProsto (https://fakturaprosto.pl).
 */

export const LEGAL_VERSIONS = {
  terms: "1.1.0-2026-10-07",
  privacy: "1.3.0-2026-10-15",
  cookies: "1.2.0-2026-10-15",
  dpa: "1.1.0-2026-10-07",
  subprocessors: "1.1.0-2026-10-15",
} as const;

export const EFFECTIVE_DATE = "7 października 2026 r.";
export const LEGAL_EFFECTIVE_DATES = {
  terms: EFFECTIVE_DATE,
  privacy: "15 października 2026 r.",
  cookies: "15 października 2026 r.",
  dpa: EFFECTIVE_DATE,
  subprocessors: "15 października 2026 r.",
} as const;

export interface OperatorConfig {
  serviceName: string;
  serviceUrl: string;
  companyName: string;
  legalForm: string;
  nip: string;
  regon: string;
  krs: string;
  addressStreet: string;
  addressPostal: string;
  addressCity: string;
  addressCountry: string;
  emailContact: string;
  emailSupport: string;
  emailPrivacy: string;
  emailComplaints: string;
  phone: string;
  isConfigured: boolean; // flaga czy operator uzupełnił swoje dane
}

/**
 * Rzeczywiste dane Operatora Serwisu.
 * Jeśli dane nie zostały jeszcze formalnie wprowadzone w panelu,
 * wyświetlane są czytelne znaczniki [PLACEHOLDER] zgodnie z wymogiem RODO/UŚUDE.
 */
export const OPERATOR_CONFIG: OperatorConfig = {
  serviceName: "FakturaProsto",
  serviceUrl: "https://fakturaprosto.pl",
  companyName: "MICHAŁ WYCZAŁEK-JAGIEŁŁO GEOMATIC",
  legalForm: "Jednoosobowa działalność gospodarcza",
  nip: "7831574888",
  regon: "",
  krs: "",
  addressStreet: "ul. Ogórkowa 63S",
  addressPostal: "04-998",
  addressCity: "Warszawa",
  addressCountry: "Polska",
  emailContact: "faktura.prosto@gmail.com",
  emailSupport: "faktura.prosto@gmail.com",
  emailPrivacy: "faktura.prosto@gmail.com",
  emailComplaints: "faktura.prosto@gmail.com",
  phone: "",
  isConfigured: true,
};

export interface SubprocessorInfo {
  id: string;
  name: string;
  category: "database" | "hosting" | "email" | "infrastructure" | "payments" | "analytics";
  categoryLabel: string;
  purpose: string;
  location: string;
  transferMechanism: string;
  privacyPolicyUrl: string;
}

/**
 * Rzeczywisty wykaz podwykonawców (podprocesorów) biorących udział
 * w przetwarzaniu danych na zlecenie w ramach serwisu FakturaProsto.
 */
export const SUBPROCESSORS: SubprocessorInfo[] = [
  {
    id: "mongodb-atlas",
    name: "MongoDB Inc. (MongoDB Atlas)",
    category: "database",
    categoryLabel: "Zarządzana baza danych w chmurze",
    purpose: "Przechowywanie danych kont, firm, kontrahentów, faktur, logów i sesji w zaszyfrowanej bazie danych.",
    location: "Unia Europejska (klaster frankfurcki eu-central-1) / USA",
    transferMechanism: "EU-US Data Privacy Framework (DPF) oraz Standardowe Klauzule Umowne (SCC) zatwierdzone przez KE.",
    privacyPolicyUrl: "https://www.mongodb.com/legal/privacy/privacy-policy",
  },
  {
    id: "hosting-infrastructure",
    name: "cyber_Folks S.A. / Netlify Inc.",
    category: "hosting",
    categoryLabel: "Hosting aplikacji i serwery aplikacyjne",
    purpose: "Udostępnianie aplikacji Next.js, serwowanie interfejsu WWW, obsługa żądań HTTPS i buforowanie.",
    location: "Polska (cyber_Folks, Poznań) / Unia Europejska i USA (Netlify Global Edge)",
    transferMechanism: "Serwery w UE (cyber_Folks); dla Netlify: Standardowe Klauzule Umowne (SCC) oraz Data Privacy Framework.",
    privacyPolicyUrl: "https://cyberfolks.pl/polityka-prywatnosci/",
  },
  {
    id: "resend-email",
    name: "Resend Inc. (lub dedykowany serwer SMTP Operatora)",
    category: "email",
    categoryLabel: "Wysyłka poczty transakcyjnej",
    purpose: "Dostarczanie faktur PDF do klientów, resetowanie haseł oraz powiadomienia e-mail.",
    location: "Unia Europejska / USA",
    transferMechanism: "Standardowe Klauzule Umowne (SCC) oraz Data Privacy Framework.",
    privacyPolicyUrl: "https://resend.com/legal/privacy-policy",
  },
  {
    id: "stripe-payments",
    name: "Stripe Inc. / Stripe Payments Europe, Ltd.",
    category: "payments",
    categoryLabel: "Obsługa płatności i subskrypcji",
    purpose: "Bezpieczne przetwarzanie płatności bezgotówkowych kartami płatniczymi, obsługa odnawialnych subskrypcji planu Pro oraz rozliczenia.",
    location: "Irlandia (UE) / USA",
    transferMechanism: "EU-US Data Privacy Framework (DPF) oraz Standardowe Klauzule Umowne (SCC) zatwierdzone przez KE.",
    privacyPolicyUrl: "https://stripe.com/legal/privacy-center",
  },
  {
    id: "google-analytics",
    name: "Google Ireland Limited / Google LLC (Google Analytics 4)",
    category: "analytics",
    categoryLabel: "Opcjonalne statystyki publicznych stron",
    purpose: "Po zgodzie analitycznej: pomiar odsłon publicznych stron i źródeł odwiedzin. Bez panelu, logowania, danych kont, faktur, kontrahentów i płatności; Google nie otrzymuje powierzonych danych księgowych Klienta.",
    location: "Irlandia (UE) / infrastruktura Google, w tym USA",
    transferMechanism: "Zgodnie z warunkami ochrony danych Google: mechanizmy transferu opisane przez Google, w tym DPF lub SCC, zależnie od podmiotu odbierającego i zakresu usługi.",
    privacyPolicyUrl: "https://policies.google.com/privacy?hl=pl",
  },
];

export interface CookieItem {
  name: string;
  category: "essential" | "functional" | "analytics" | "marketing";
  categoryLabel: string;
  provider: string;
  purpose: string;
  expiry: string;
  type: "cookie" | "localStorage";
}

/**
 * Rzeczywisty inwentarz plików cookies i technologii pamięci przeglądarki.
 */
export const COOKIE_INVENTORY: CookieItem[] = [
  {
    name: "_ga / _ga_4P218PFSBX",
    category: "analytics",
    categoryLabel: "Analityczne (opcjonalne)",
    provider: "Google Analytics 4; cookies własnej domeny fakturaprosto.pl",
    purpose: "Pseudonimowy identyfikator przeglądarki i stan sesji do statystyk publicznych stron. Ustawiane wyłącznie po zgodzie; bez funkcji reklamowych i Google Signals.",
    expiry: "Do 30 dni, bez automatycznego odnawiania terminu przy kolejnych odsłonach; usuwane z przeglądarki po wycofaniu zgody",
    type: "cookie",
  },
  {
    name: "fakturo_pilot",
    category: "analytics",
    categoryLabel: "Analityczne (opcjonalne)",
    provider: "fakturaprosto.pl (własne)",
    purpose: "Pseudonim przeglądarki do dobrowolnego pomiaru etapów korzystania i wydajności. HttpOnly, Secure, SameSite=Lax; bez danych faktur i adresów URL.",
    expiry: "Maksymalnie 30 dni, usuwane przy wycofaniu zgody",
    type: "cookie",
  },
  {
    name: "auth_session / fakturaprosto_session / fakturo_session",
    category: "essential",
    categoryLabel: "Niezbędne (techniczne)",
    provider: "fakturaprosto.pl (własne)",
    purpose: "Identyfikacja aktywnej, uwierzytelnionej sesji Użytkownika. Zabezpieczone flagami HttpOnly, Secure, SameSite=Lax.",
    expiry: "30 dni",
    type: "cookie",
  },
  {
    name: "__Secure-next-auth.session-token",
    category: "essential",
    categoryLabel: "Niezbędne (techniczne)",
    provider: "fakturaprosto.pl (własne)",
    purpose: "Zabezpieczony token sesji zgodny z frameworkiem NextAuth.",
    expiry: "30 dni",
    type: "cookie",
  },
  {
    name: "fakturaprosto_consent / fakturo_consent",
    category: "essential",
    categoryLabel: "Niezbędne (techniczne)",
    provider: "fakturaprosto.pl (własne)",
    purpose: "Zapisanie wyboru Użytkownika dotyczącego preferencji prywatności i zgód cookies (CMP).",
    expiry: "12 miesięcy",
    type: "cookie",
  },
  {
    name: "fakturaprosto-theme / fakturo-theme",
    category: "essential",
    categoryLabel: "Niezbędne (funkcjonalne)",
    provider: "fakturaprosto.pl (własne)",
    purpose: "Zapamiętanie wybranego motywu graficznego (ciemny / jasny / systemowy) w celu uniknięcia migotania ekranu.",
    expiry: "Trwałe (do wyczyszczenia pamięci podręcznej)",
    type: "localStorage",
  },
  {
    name: "pref_currency / pref_payment_terms / pref_language",
    category: "functional",
    categoryLabel: "Funkcjonalne (opcjonalne)",
    provider: "fakturaprosto.pl (własne)",
    purpose: "Zapamiętanie preferencji wystawiania faktur (domyślna waluta, termin płatności, język wydruku).",
    expiry: "Trwałe (do wyczyszczenia)",
    type: "localStorage",
  },
];

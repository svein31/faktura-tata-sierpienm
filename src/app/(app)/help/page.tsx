"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Mail,
  FileText,
  ShieldCheck,
  Building2,
  Receipt,
  FileCheck2,
  Briefcase,
  DollarSign,
  Users2,
  Sparkles,
  Search,
  ArrowRight,
  HelpCircle,
  Send,
  CreditCard,
  Globe,
  History,
  KeyRound,
  UserCheck,
  Shield,
  Cookie,
  Download,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openOnboardingTour } from "@/components/onboarding/onboarding-tour";

interface HelpSection {
  id: string;
  category: "email" | "invoices" | "ksef" | "company" | "finances" | "accountant" | "team" | "legal";
  categoryLabel: string;
  title: string;
  icon: React.ElementType;
  badge?: string;
  isFeatured?: boolean;
  steps: Array<{
    title: string;
    description: string;
  }>;
  quickAction?: {
    label: string;
    href: string;
  };
}

const HELP_SECTIONS: HelpSection[] = [
  // ── SEKCJA WYRÓŻNIONA: WYSYŁKA E-MAILEM (W CAŁOŚCI POGRUBIONA CZCIONKA) ──
  {
    id: "email-send",
    category: "email",
    categoryLabel: "Wysyłka e-mail",
    title: "Jak wysłać fakturę e-mailem bezpośrednio z systemu",
    icon: Mail,
    badge: "Wyróżnione • Wymóg",
    isFeatured: true,
    steps: [
      {
        title: "1. Otwórz listę faktur lub szczegóły wybranego dokumentu",
        description:
          "Przejdź do zakładki „Faktury” i kliknij ikonę koperty w tabeli przy wybranej fakturze LUB wejdź w szczegóły dokumentu i kliknij niebieski przycisk „Wyślij e-mailem”.",
      },
      {
        title: "2. Sprawdź automatycznie uzupełniony adres odbiorcy",
        description:
          "System sam wstawia adres e-mail kontrahenta z bazy danych. W razie potrzeby możesz go w oknie zmienić oraz rozwinąć pola DW (Kopia) lub UDW (Ukryta kopia).",
      },
      {
        title: "3. Skorzystaj z gotowego tematu i treści lub wpisz własne",
        description:
          "Szablon wiadomości automatycznie zawiera numer dokumentu, kwotę brutto, walutę, termin płatności, Twój rachunek bankowy, numer KSeF oraz stopkę Twojej firmy.",
      },
      {
        title: "4. Zweryfikuj dołączone załączniki",
        description:
          "Faktura PDF (z kodem QR KSeF i aktualnym statusem płatności) jest zaznaczona domyślnie. Opcjonalnie możesz dołączyć oficjalny plik XML FA(3) oraz urzędowe UPO.",
      },
      {
        title: "5. Kliknij „Wyślij fakturę e-mailem”",
        description:
          "Wiadomość zostanie natychmiast wysłana do klienta. System zapisze dokładną datę wysyłki, adresata oraz zaktualizuje historię doręczeń w zakładce dokumentu.",
      },
      {
        title: "6. Automatyczna wysyłka po KSeF (opcjonalnie)",
        description:
          "W oknie wysyłki możesz włączyć przełącznik „Automatycznie wyślij po przyjęciu przez KSeF” – gdy ministerstwo nada numer KSeF, system sam dośle klientowi finalny PDF z UPO.",
      },
    ],
    quickAction: {
      label: "Przejdź do listy faktur i wyślij e-mail",
      href: "/invoices",
    },
  },

  // ── FAKTURY I DOKUMENTY ──
  {
    id: "invoice-new",
    category: "invoices",
    categoryLabel: "Faktury",
    title: "Wystawianie nowej faktury VAT",
    icon: FileText,
    steps: [
      {
        title: "1. Kliknij „+ Wystaw fakturę”",
        description: "Przycisk znajdziesz na samej górze lewego menu bocznego.",
      },
      {
        title: "2. Wpisz NIP nabywcy",
        description: "Po wpisaniu NIP kliknij ikonę lupy – nazwa i adres firmy uzupełnią się natychmiast z bazy GUS REGON.",
      },
      {
        title: "3. Dodaj pozycje na fakturze",
        description: "Wpisz nazwę towaru/usługi, ilość, cenę netto oraz wybierz stawkę VAT (np. 23%, 8%, zw, 0%).",
      },
      {
        title: "4. Wybierz termin i konto",
        description: "Wskaż termin płatności (np. 7, 14 dni) oraz rachunek bankowy przypisany do Twojej firmy.",
      },
      {
        title: "5. Zapisz lub wyślij do KSeF",
        description: "Kliknij „Wystaw fakturę”, aby zapisać dokument, pobrać PDF lub od razu zgłosić go do KSeF.",
      },
    ],
    quickAction: {
      label: "Wystaw nową fakturę",
      href: "/invoices/new",
    },
  },

  // ── KSEF 2.0 ──
  {
    id: "ksef-flow",
    category: "ksef",
    categoryLabel: "Krajowy System e-Faktur",
    title: "Wysyłka do KSeF i pobieranie UPO",
    icon: ShieldCheck,
    steps: [
      {
        title: "1. Kliknij „Wyślij do KSeF”",
        description: "W widoku faktury kliknij przycisk „Wyślij do KSeF”. System wygeneruje ustrukturyzowany plik XML FA(3).",
      },
      {
        title: "2. Odbiór numeru referencyjnego",
        description: "Ministerstwo przyjmuje dokument i nadaje mu unikalny 36-znakowy Identyfikator KSeF.",
      },
      {
        title: "3. Pobranie UPO i kodów QR",
        description: "Po zatwierdzeniu w KSeF system automatycznie pobiera UPO (Urzędowe Poświadczenie Odbioru) i nanosi kod weryfikacyjny QR na plik PDF.",
      },
    ],
    quickAction: {
      label: "Centrum KSeF",
      href: "/ksef",
    },
  },

  // ── POBIERANIE Z GUS PO NIP ──
  {
    id: "gus-lookup",
    category: "company",
    categoryLabel: "GUS / Dane",
    title: "Automatyczne pobieranie danych kontrahenta z GUS",
    icon: Building2,
    steps: [
      {
        title: "1. Wpisz 10 cyfr NIP",
        description: "W formularzu faktury lub w zakładce „Kontrahenci” wpisz NIP bez kresek.",
      },
      {
        title: "2. Kliknij ikonę lupy / „Szukaj w GUS”",
        description: "System łączy się bezpośrednio z bazą REGON Głównego Urzędu Statystycznego.",
      },
      {
        title: "3. Automatyczne uzupełnienie",
        description: "Pełna nazwa spółki, adres siedziby, kod pocztowy i miasto zostają uzupełnione w 1 sekundę.",
      },
    ],
    quickAction: {
      label: "Baza Kontrahentów",
      href: "/contractors",
    },
  },

  // ── LOGO FIRMY NA FAKTURZE ──
  {
    id: "company-logo",
    category: "company",
    categoryLabel: "Logo i Wygląd",
    title: "Dodawanie i zmiana Logo firmy na fakturze i w PDF",
    icon: Sparkles,
    steps: [
      {
        title: "1. Wejdź w Ustawienia Firmy",
        description: "W lewym menu wybierz „Moje Firmy / NIP”, a następnie kliknij ikonę ołówka przy domyślnej firmie.",
      },
      {
        title: "2. Wgraj plik lub wklej link URL",
        description: "W sekcji „Logo firmy” kliknij „Wybierz plik z dysku…” (PNG lub JPG) albo wklej bezpośredni adres URL do logo.",
      },
      {
        title: "3. Zapisz zmiany",
        description: "Kliknij „Zapisz firmę”. Twoje logo natychmiast pojawi się w lewym górnym rogu faktury, w plikach PDF oraz w nagłówku e-maili.",
      },
    ],
    quickAction: {
      label: "Edytuj dane i logo firmy",
      href: "/settings/companies",
    },
  },

  // ── OFERTY I PROFORMY ──
  {
    id: "offers-convert",
    category: "invoices",
    categoryLabel: "Oferty i Zlecenia",
    title: "Oferty handlowe i konwersja do faktury 1 kliknięciem",
    icon: FileCheck2,
    steps: [
      {
        title: "1. Utwórz ofertę cenową",
        description: "W menu „Oferty” kliknij „Nowa oferta”, dodaj wycenione pozycje i wygeneruj PDF dla klienta.",
      },
      {
        title: "2. Akceptacja klienta",
        description: "Gdy klient zaakceptuje warunki, otwórz ofertę w systemie.",
      },
      {
        title: "3. Kliknij „Konwertuj do faktury”",
        description: "System automatycznie utworzy pełną fakturę VAT z dokładnie tymi samymi pozycjami i danymi klienta.",
      },
    ],
    quickAction: {
      label: "Przejdź do Ofert",
      href: "/offers",
    },
  },

  // ── ZLECENIA I CZAS PRACY ──
  {
    id: "orders-work",
    category: "invoices",
    categoryLabel: "Zlecenia",
    title: "Zlecenia & Rejestracja czasu pracy",
    icon: Briefcase,
    steps: [
      {
        title: "1. Dodaj zlecenie",
        description: "W zakładce „Zlecenia & Czas” twórz projekty ze stawką godzinową lub ryczałtową.",
      },
      {
        title: "2. Śledź realizację",
        description: "Zapisuj przepracowane godziny i etapy prac dla danego klienta.",
      },
      {
        title: "3. Zafakturuj jednym kliknięciem",
        description: "Kliknij „Wystaw fakturę ze zlecenia”, aby zamienić zrealizowany projekt na oficjalną fakturę VAT.",
      },
    ],
    quickAction: {
      label: "Zlecenia i Czas",
      href: "/orders",
    },
  },

  // ── KOSZTY I WYDATKI ──
  {
    id: "expenses-management",
    category: "finances",
    categoryLabel: "Koszty i Wydatki",
    title: "Ewidencja kosztów i odliczenia VAT",
    icon: Receipt,
    steps: [
      {
        title: "1. Dodaj fakturę kosztową",
        description: "W zakładce „Koszty i wydatki” kliknij „Dodaj wydatek”.",
      },
      {
        title: "2. Uzupełnij kwoty i kategorię",
        description: "Wpisz kwotę netto, stawkę VAT oraz przypisz kategorię (np. Paliwo, Biuro, Oprogramowanie, Sprzęt).",
      },
      {
        title: "3. Automatyczny bilans podatkowy",
        description: "Aplikacja natychmiast przeliczy Twój realny zysk netto oraz kwotę podatku VAT do zapłaty w urzędzie skarbowym.",
      },
    ],
    quickAction: {
      label: "Koszty i wydatki",
      href: "/expenses",
    },
  },

  // ── FINANSE I WYCIĄGI ──
  {
    id: "finances-statements",
    category: "finances",
    categoryLabel: "Finanse i Bank",
    title: "Finanse, płatności i import wyciągów bankowych",
    icon: DollarSign,
    steps: [
      {
        title: "1. Oznaczanie wpłat",
        description: "W szczegółach faktury możesz w dowolnej chwili zarejestrować wpłatę pełną lub częściową.",
      },
      {
        title: "2. Import wyciągów (CSV / MT940)",
        description: "W menu „Finanse & Wyciągi” kliknij „Importuj wyciąg” i wgraj plik z konta bankowego – system sam powiąże wpłaty.",
      },
      {
        title: "3. Kontrola płynności",
        description: "Śledź przeterminowane faktury oraz łączny stan należności od kontrahentów w czasie rzeczywistym.",
      },
    ],
    quickAction: {
      label: "Finanse i wyciągi",
      href: "/finances",
    },
  },

  // ── PACZKA DLA KSIĘGOWEJ ──
  {
    id: "accountant-pack",
    category: "accountant",
    categoryLabel: "Księgowość",
    title: "Paczka dla Księgowej i eksport dokumentów",
    icon: Users2,
    steps: [
      {
        title: "1. Otwórz menu „Księgowość & Zespół”",
        description: "Wybierz miesiąc i rok rozliczeniowy, który chcesz przekazać do biura rachunkowego.",
      },
      {
        title: "2. Kliknij „Pobierz paczkę ZIP”",
        description: "System spakuje wszystkie faktury PDF, zestawienie sprzedaży w Excel/CSV oraz pliki XML do jednego archiwum ZIP.",
      },
      {
        title: "3. Dostęp dla księgowej",
        description: "Możesz dodać użytkownika z rolą „Księgowy” – otrzyma własne konto z bezpośrednim wglądem do dokumentów.",
      },
    ],
    quickAction: {
      label: "Księgowość i Paczka ZIP",
      href: "/accountant",
    },
  },

  // ── ZESPÓŁ I UPRAWNIENIA (WIELODOSTĘP) ──
  {
    id: "team-roles-permissions",
    category: "team",
    categoryLabel: "Zespół i Uprawnienia",
    title: "Wspólna firma, zapraszanie użytkowników i role w zespole",
    icon: UserCheck,
    badge: "Nowość • Multi-user",
    steps: [
      {
        title: "1. Otwórz ekran „Ustawienia → Zespół i uprawnienia”",
        description:
          "Z lewego menu bocznego wybierz „Zespół i uprawnienia” lub przejdź do Ustawień. Zobaczysz listę członków Twojej aktywnej firmy, ich role oraz statusy zaproszeń.",
      },
      {
        title: "2. Wpisz e-mail i wskaż rolę",
        description:
          "Wpisz adres e-mail współpracownika i wybierz jedną z 4 domyślnych ról: Właściciel (pełna władza), Księgowa / Biuro (faktury, korekty, wpłaty, JPK, audyt), Pracownik / Sprzedawca (faktury i kontrahenci) lub Podgląd (tylko wgląd).",
      },
      {
        title: "3. Skonfiguruj granularne uprawnienia",
        description:
          "Dla każdej roli możesz indywidualnie włączyć lub wyłączyć: wystawianie faktur, tworzenie korekt, rejestrację wpłat, eksporty/JPK, wysyłkę do KSeF, konta bankowe oraz zarządzanie zespołem.",
      },
      {
        title: "4. Wygeneruj i wyślij bezpieczny link zaproszenia",
        description:
          "Kliknij „Wyślij zaproszenie”. System wygeneruje unikalny token ważny 7 dni. Możesz skopiować link do schowka i przekazać go zapraszanemu pracownikowi.",
      },
      {
        title: "5. Akceptacja zaproszenia i natychmiastowe odcięcie dostępu",
        description:
          "Odbiorca loguje się własnym kontem (lub rejestruje nowe) i dołącza do firmy. Właściciel może w dowolnym momencie zmienić rolę lub usunąć członka — dostęp w aktywnej sesji zostaje odcięty natychmiastowo. Ostatni właściciel firmy jest bezwzględnie chroniony przed usunięciem.",
      },
    ],
    quickAction: {
      label: "Zarządzaj zespołem",
      href: "/settings/team",
    },
  },

  // ── FAKTURY WALUTOWE I KURSY NBP (ART. 31A) ──
  {
    id: "currency-invoices-nbp",
    category: "invoices",
    categoryLabel: "Waluty i NBP",
    title: "Faktury walutowe i automatyczne kursy NBP (art. 31a ustawy o VAT)",
    icon: Globe,
    badge: "Nowość • art. 31a VAT",
    steps: [
      {
        title: "1. Wybierz walutę obcą dokumentu",
        description:
          "W nagłówku nowej faktury zmień walutę z PLN na EUR, USD, GBP, CHF, NOK, SEK lub CAD. System automatycznie wyświetli dedykowany panel rozliczenia walutowego NBP.",
      },
      {
        title: "2. Automatyczne pobranie tabeli kursowej NBP",
        description:
          "System łączy się z oficjalnym API Narodowego Banku Polskiego. Zgodnie z art. 31a ust. 1 i 2 ustawy o VAT pobierany jest średni kurs z ostatniego dnia roboczego poprzedzającego dzień powstania obowiązku podatkowego (lub dzień wystawienia faktury, jeśli wystawiono ją przed sprzedażą).",
      },
      {
        title: "3. Obsługa weekendów i świąt państwowych",
        description:
          "W przypadku świąt lub weekendów algorytm automatycznie cofa się do ostatniego opublikowanego notowania NBP (brak fikcyjnych kursów 1.0 i brak błędnego kursu z bieżącego dnia).",
      },
      {
        title: "4. Własny kurs podatnika z uzasadnieniem",
        description:
          "Jeśli stosujesz inny kurs (np. bankowy, z umowy ramowej lub celny), zaznacz opcję „Własny kurs” i podaj wartość oraz wymagane prawem uzasadnienie biznesowe.",
      },
      {
        title: "5. Trwały zapis kwot w PLN i format dwujęzyczny PL/EN",
        description:
          "Dokument zapisuje dokładny numer tabeli, datę notowania oraz przeliczone kwoty Netto PLN, VAT PLN i Brutto PLN na potrzeby JPK_V7. Na wydruku PDF oraz w podglądzie możesz wybrać szablon dwujęzyczny PL/EN.",
      },
    ],
    quickAction: {
      label: "Wystaw fakturę walutową",
      href: "/invoices/new",
    },
  },

  // ── KONTRAHENCI ZAGRANICZNI (VAT UE I TIN) ──
  {
    id: "foreign-contractors-vat-tin",
    category: "company",
    categoryLabel: "Kontrahenci zagraniczni",
    title: "Kontrahenci z Unii Europejskiej (format VAT UE) oraz spoza UE (TIN)",
    icon: Building2,
    badge: "Nowość • UE i Świat",
    steps: [
      {
        title: "1. Wybierz typ identyfikatora podatkowego",
        description:
          "W formularzu kontrahenta wskaż: NIP (Polska), VAT UE (kraje Unii Europejskiej), TIN / Tax ID (spoza UE, np. Ghana, USA, Wielka Brytania) lub „Brak identyfikatora”.",
      },
      {
        title: "2. Podmioty z Unii Europejskiej (format VAT UE)",
        description:
          "Wybierz kod kraju i wpisz numer VAT UE. Przycisk „Sprawdź w VIES” pobiera bieżący wynik z Komisji Europejskiej; gdy usługa jest niedostępna, zobaczysz osobny komunikat. Sam zapis numeru sprawdza wyłącznie format.",
      },
      {
        title: "3. Podmioty spoza UE (np. USA, Ghana, Azja)",
        description:
          "Wybierz typ TIN / Tax ID. Identyfikator zagraniczny zachowuje litery, cyfry oraz separatory — system nie nakłada polskiego algorytmu kontrolnego NIP i nie odcina znaków.",
      },
      {
        title: "4. Stawki VAT: Odwrotne obciążenie („oo”) i eksport",
        description:
          "Dla wewnątrzwspólnotowego świadczenia usług (art. 100) wybierz stawkę „oo” (odwrotne obciążenie / reverse charge). Na fakturze pojawi się prawna adnotacja o rozliczeniu podatku przez nabywcę. Dla eksportu towarów zastosuj stawkę 0% lub np.",
      },
      {
        title: "5. Prawidłowa struktura KSeF FA(3)",
        description:
          "W wygenerowanym pliku XML KSeF węzeł Podmiot2 zostaje automatycznie wypełniony jako `<KodUE><NrVatUE>` dla kontrahentów unijnych lub `<KodKraju><NrID>` dla podmiotów ze świata.",
      },
    ],
    quickAction: {
      label: "Baza Kontrahentów",
      href: "/contractors",
    },
  },

  // ── RACHUNKI WIELOWALUTOWE (IBAN / SWIFT) ──
  {
    id: "multi-currency-bank-accounts",
    category: "finances",
    categoryLabel: "Konta i Banki",
    title: "Rachunki wielowalutowe, IBAN, SWIFT/BIC i zabezpieczenie kodów QR",
    icon: CreditCard,
    badge: "Nowość • IBAN & SWIFT",
    steps: [
      {
        title: "1. Dodaj konto walutowe w profilu firmy",
        description:
          "W Ustawienia → Moje Firmy / NIP kliknij edycję firmy i rozwiń sekcję „Rachunki bankowe i konta walutowe”.",
      },
      {
        title: "2. Wprowadź międzynarodowy numer IBAN i kod SWIFT/BIC",
        description:
          "Wybierz walutę konta (np. EUR, USD, GBP, PLN), wpisz numer IBAN (walidacja sumy kontrolnej MOD-97-10) oraz kod SWIFT/BIC Twojego banku (np. PKOPPLPW).",
      },
      {
        title: "3. Inteligentne podstawianie konta na fakturze",
        description:
          "Gdy w kreatorze faktury wybierzesz walutę EUR lub USD, system automatycznie zaproponuje dedykowany rachunek dla tej waluty lub pozwoli wybrać inne konto z listy.",
      },
      {
        title: "4. Blokada polskiego kodu QR dla transakcji nie-PLN",
        description:
          "Zgodnie z przepisami bankowymi i standardem KIR/ZBP polski kod QR do przelewów dotyczy wyłącznie złotówek (PLN). Przy fakturach walutowych generowanie kodu QR jest bezpiecznie blokowane, a na wydruku eksponowane są parametry SWIFT/BIC i IBAN.",
      },
    ],
    quickAction: {
      label: "Konfiguruj konta w Moje Firmy",
      href: "/settings/companies",
    },
  },

  // ── DZIENNIK AUDYTU (AUDIT LOG) ──
  {
    id: "audit-log-tracking",
    category: "accountant",
    categoryLabel: "Audyt i Bezpieczeństwo",
    title: "Trwały dziennik audytu (Audit Log), historia zmian i ochrona współbieżności",
    icon: History,
    badge: "Nowość • Trwały rejestr",
    steps: [
      {
        title: "1. Otwórz zakładkę „Historia i audyt zmian” w szczegółach faktury",
        description:
          "W widoku faktury kliknij przycisk „Historia i audyt zmian (Audit Log)” obok podglądu dokumentu.",
      },
      {
        title: "2. Pełna identyfikacja tożsamości autora operacji",
        description:
          "Każda akcja (utworzenie, edycja kwot, zarejestrowanie wpłaty, wysyłka do KSeF, pobranie UPO, wysyłka mailowa) ma trwale przypisanego użytkownika (imię, e-mail, rola, adres IP i znacznik czasu).",
      },
      {
        title: "3. Porównanie starych i nowych wartości (Field Diff)",
        description:
          "System rejestruje dokładny diff zmienionych pól — widzisz przekreśloną starą wartość oraz nową zatwierdzoną wartość.",
      },
      {
        title: "4. Zabezpieczenie przed nadpisaniem współbieżnym (OCC Versioning)",
        description:
          "Dzięki mechanizmowi Optimistic Concurrency Control, jeśli dwóch użytkowników otworzy tę samą fakturę i spróbuje zapisać sprzeczne zmiany, system zablokuje kolizję i poprosi o odświeżenie najnowszej wersji.",
      },
      {
        title: "5. Zabezpieczenie sekretów i nieusuwalność wpisów",
        description:
          "Dziennik audytu jest trwały i niemodyfikowalny. Wrażliwe dane (hasła, tokeny sesyjne, prywatne klucze) są automatycznie maskowane przed zapisaniem w bazie.",
      },
    ],
    quickAction: {
      label: "Przejdź do faktur",
      href: "/invoices",
    },
  },

  // ── DOKUMENTY PRAWNE, ZGODY I RODO ──
  {
    id: "legal-documents-and-consents",
    category: "legal",
    categoryLabel: "Prywatność i RODO",
    title: "Dokumenty prawne, akceptacja regulaminu i rejestr zgód (RODO / PKE)",
    icon: Shield,
    badge: "Nowość • RODO & PKE",
    steps: [
      {
        title: "1. Komplet oficjalnych dokumentów prawnych",
        description:
          "W stopce serwisu oraz w menu bocznym masz stały dostęp do 5 publicznych dokumentów prawnych: Regulaminu świadczenia usług (/regulamin), Polityki prywatności (/polityka-prywatnosci), Polityki cookies (/polityka-cookies), Umowy powierzenia przetwarzania danych DPA (/powierzenie-danych) oraz Listy podwykonawców i podprocesorów (/podwykonawcy).",
      },
      {
        title: "2. Przejrzysta akceptacja regulaminu",
        description:
          "Nowi użytkownicy akceptują regulamin przy rejestracji konta oraz przy dołączaniu do zespołu przez zaproszenie. Checkbox akceptacji regulaminu nigdy nie jest domyślnie zaznaczony, a zgody marketingowe są całkowicie opcjonalne.",
      },
      {
        title: "3. Wersjonowanie regulaminu i bezpieczne powiadomienia",
        description:
          "Gdy regulamin zostanie zaktualizowany do nowej wersji, system wyświetla użytkownikowi modal informacyjny z kluczowymi zmianami. Zgoda jest rejestrowana z podaniem wersji, zanonimizowanego adresu IP i daty akceptacji.",
      },
      {
        title: "4. Baner cookies zgodny z Prawem Komunikacji Elektronicznej (PKE)",
        description:
          "Baner zgód na pliki cookies oferuje 3 równorzędne przyciski („Zaakceptuj wszystkie”, „Odrzuć opcjonalne”, „Dostosuj preferencje”). Cookies analityczne i funkcjonalne nie są uruchamiane bez wyraźnej, aktywnej zgody.",
      },
      {
        title: "5. Zmiana preferencji cookies w dowolnej chwili",
        description:
          "Możesz w każdej chwili zmienić swoje ustawienia cookies — klikając link „Preferencje cookies” w stopce strony, w menu bocznym lub w Ustawieniach konta.",
      },
    ],
    quickAction: {
      label: "Przeczytaj Regulamin",
      href: "/regulamin",
    },
  },

  // ── PRYWATNOŚĆ I EKSPORT DANYCH RODO ──
  {
    id: "legal-privacy-data-export",
    category: "legal",
    categoryLabel: "Prywatność i RODO",
    title: "Panel prywatności w Ustawieniach i prawo do przenoszenia danych (art. 20 RODO)",
    icon: Download,
    badge: "Nowość • art. 20 RODO",
    steps: [
      {
        title: "1. Wejdź w zakładkę „Prywatność i zgody”",
        description:
          "Przejdź do Ustawienia → Twoje konto i kliknij nową zakładkę „Prywatność i zgody”.",
      },
      {
        title: "2. Wgląd w historię udzielonych zgód",
        description:
          "W panelu widzisz datę akceptacji aktualnego regulaminu oraz stan wszystkich opcjonalnych zgód (np. e-mail marketing).",
      },
      {
        title: "3. Odwołanie opcjonalnych zgód jednym kliknięciem",
        description:
          "Zgodę na komunikację marketingową lub cookies możesz wycofać w dowolnym momencie za pomocą jednego przełącznika — zmiana jest natychmiast rejestrowana w trwałej bazie zgód.",
      },
      {
        title: "4. Pobranie kopii danych osobowych (Eksport RODO)",
        description:
          "Zgodnie z art. 20 RODO masz prawo przenieść swoje dane. Kliknij przycisk „Pobierz kopię danych (JSON)”, aby natychmiast wyeksportować uporządkowany, maszynowo czytelny plik JSON zawierający profil, podpięte firmy, historię zgód oraz podsumowanie wystawionych dokumentów i kontrahentów.",
      },
      {
        title: "5. Prawo do usunięcia konta (art. 17 RODO)",
        description:
          "W zakładce „Bezpieczeństwo konta” możesz w każdej chwili skorzystać z procedury trwałego usunięcia konta wraz ze wszystkimi powiązanymi danymi.",
      },
    ],
    quickAction: {
      label: "Otwórz Prywatność i zgody",
      href: "/settings/account",
    },
  },
];

const CATEGORIES = [
  { id: "all", label: "Wszystkie instrukcje" },
  { id: "legal", label: "Prywatność i RODO" },
  { id: "team", label: "Zespół i Audyt" },
  { id: "email", label: "Wysyłka e-mail" },
  { id: "invoices", label: "Faktury i Waluty" },
  { id: "ksef", label: "KSeF 2.0" },
  { id: "finances", label: "Konta i Finanse" },
  { id: "company", label: "Kontrahenci i GUS" },
  { id: "accountant", label: "Księgowość" },
];

export default function HelpPage() {
  const [search, setSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("all");

  const filteredSections = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return HELP_SECTIONS.filter((section) => {
      const matchCat = activeCategory === "all" || section.category === activeCategory;
      if (!matchCat) return false;
      if (!q) return true;
      const inTitle = section.title.toLowerCase().includes(q);
      const inCategory = section.categoryLabel.toLowerCase().includes(q);
      const inSteps = section.steps.some(
        (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      );
      return inTitle || inCategory || inSteps;
    });
  }, [search, activeCategory]);

  return (
    <div className="space-y-6 pb-16">
      {/* Nagłówek strony */}
      <PageHeader
        title="Instrukcja obsługi FakturaProsto"
        description="Krótki, szczegółowy przewodnik krok po kroku po wszystkich funkcjach systemu fakturowania, KSeF i finansów."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openOnboardingTour}
              className="gap-1.5 shadow-sm text-xs border-border/70"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Samouczek onboardingowy</span>
            </Button>
            <Link href="/invoices/new">
              <Button size="sm" className="gap-1.5 shadow-sm">
                <span>+ Wystaw fakturę</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Pasek wyszukiwania i kategorie */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Szukaj instrukcji... np. mail, ksef, logo, gus, koszt, paczka"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs sm:text-sm bg-card/60"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              Wyczyść
            </button>
          )}
        </div>

        {/* Filtry kategorii */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground shadow-xs scale-105"
                  : "bg-card/70 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── WYRÓŻNIONA KARTA: WYSYŁKA FAKTURY E-MAILEM (W CAŁOŚCI POGRUBIONA CZCIONKA) ── */}
      {(!search || "wysyłka e-mail mail wyslij fakture poczta".includes(search.toLowerCase())) &&
        (activeCategory === "all" || activeCategory === "email") && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-3xl border-2 border-blue-500/40 bg-gradient-to-br from-blue-500/[0.08] via-card to-indigo-500/[0.08] p-5 sm:p-7 shadow-lg shadow-blue-500/5 relative overflow-hidden"
          >
            {/* Ozdobny gradient w tle */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/15 blur-3xl" />

            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md">
                        Kluczowa Funkcja • Instrukcja Priorytetowa
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground mt-0.5">
                      JAK WYSŁAĆ FAKTURĘ E-MAILEM Z SYSTEMU
                    </h2>
                  </div>
                </div>

                <Link href="/invoices">
                  <Button size="sm" className="gap-1.5 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                    <Send className="h-3.5 w-3.5" />
                    <span>Otwórz listę faktur i wyślij</span>
                  </Button>
                </Link>
              </div>

              {/* TEKST INSTRUKCJI W CAŁOŚCI POGRUBIONĄ CZCIONKĄ (WYMÓG UŻYTKOWNIKA) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="rounded-2xl border border-blue-500/30 bg-card/80 p-4 shadow-2xs space-y-2">
                  <p className="font-extrabold text-[13px] text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-black">1</span>
                    Wejdź w listę faktur lub szczegóły dokumentu
                  </p>
                  <p className="font-bold text-[12.5px] leading-relaxed text-foreground">
                    Kliknij ikonę koperty w tabeli faktur LUB wejdź w podgląd faktury i kliknij niebieski przycisk „Wyślij e-mailem”.
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-500/30 bg-card/80 p-4 shadow-2xs space-y-2">
                  <p className="font-extrabold text-[13px] text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-black">2</span>
                    Adres klienta uzupełnia się samoczynnie
                  </p>
                  <p className="font-bold text-[12.5px] leading-relaxed text-foreground">
                    E-mail odbiorcy wstawia się automatycznie z danych kontrahenta. Możesz go w oknie zmienić oraz dodać kopię DW lub ukrytą UDW.
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-500/30 bg-card/80 p-4 shadow-2xs space-y-2">
                  <p className="font-extrabold text-[13px] text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-black">3</span>
                    Gotowa, profesjonalna treść z kwotą i kontem
                  </p>
                  <p className="font-bold text-[12.5px] leading-relaxed text-foreground">
                    Wiadomość sama zawiera kwotę do zapłaty, walutę, termin płatności, Twój numer konta bankowego, numer KSeF oraz stopkę firmy.
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-500/30 bg-card/80 p-4 shadow-2xs space-y-2">
                  <p className="font-extrabold text-[13px] text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-black">4</span>
                    Załącznik PDF jest dołączony domyślnie
                  </p>
                  <p className="font-bold text-[12.5px] leading-relaxed text-foreground">
                    Faktura PDF z kodami QR i statusem generuje się w locie. Możesz też zaznaczyć dołączenie pliku XML FA(3) oraz certyfikatu UPO.
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-500/30 bg-card/80 p-4 shadow-2xs space-y-2">
                  <p className="font-extrabold text-[13px] text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-black">5</span>
                    Wysyłka w 0.2 sekundy i pełna historia doręczeń
                  </p>
                  <p className="font-bold text-[12.5px] leading-relaxed text-foreground">
                    Kliknij „Wyślij fakturę e-mailem”. System zapisze dokładną datę wysyłki i odbiorcę, a w zakładce „Historia wysyłek” widzisz pełny rejestr.
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-500/30 bg-card/80 p-4 shadow-2xs space-y-2">
                  <p className="font-extrabold text-[13px] text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-black">6</span>
                    Automat po akceptacji przez KSeF
                  </p>
                  <p className="font-bold text-[12.5px] leading-relaxed text-foreground">
                    Włączając opcję „Automatycznie wyślij po KSeF”, system sam wyśle fakturę klientowi, jak tylko Ministerstwo Finansów zatwierdzi dokument.
                  </p>
                </div>
              </div>

              {/* Informacja o zmiennych na Netlify */}
              <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-3.5 text-xs text-blue-950 dark:text-blue-200">
                <p className="font-black text-[12px] uppercase tracking-wide">
                  Wskazówka: Jak aktywować wysyłkę na Netlify (ta-fax.netlify.app):
                </p>
                <p className="font-bold mt-1 text-[11.5px] leading-relaxed">
                  W panelu Netlify (Site configuration → Environment variables) dodaj zmienne:{" "}
                  <code className="bg-blue-500/20 px-1 py-0.5 rounded font-black">RESEND_API_KEY</code> oraz{" "}
                  <code className="bg-blue-500/20 px-1 py-0.5 rounded font-black">EMAIL_FROM</code>, a następnie kliknij{" "}
                  <span className="underline font-black">Deploys → Trigger deploy → Deploy site</span>.
                </p>
              </div>
            </div>
          </motion.div>
        )}

      {/* ── LISTA POZOSTAŁYCH INSTRUKCJI (SIATKA KART) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSections
          .filter((s) => !s.isFeatured)
          .map((section, idx) => {
            const Icon = section.icon;
            return (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
                className="flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-5 shadow-xs hover:border-border transition-all"
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {section.categoryLabel}
                        </span>
                        <h3 className="text-[14px] font-bold text-foreground leading-snug">
                          {section.title}
                        </h3>
                      </div>
                    </div>
                  </div>

                  {/* Kroki instrukcji */}
                  <div className="space-y-2.5 pt-1">
                    {section.steps.map((step, stepIdx) => (
                      <div key={stepIdx} className="text-xs space-y-0.5 border-l-2 border-primary/20 pl-2.5 py-0.5">
                        <p className="font-bold text-foreground text-[12px]">{step.title}</p>
                        <p className="text-muted-foreground leading-relaxed text-[11.5px]">{step.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {section.quickAction && (
                  <div className="pt-4 mt-3 border-t border-border/40">
                    <Link href={section.quickAction.href}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground transition-all group"
                      >
                        <span>{section.quickAction.label}</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                      </button>
                    </Link>
                  </div>
                )}
              </motion.div>
            );
          })}
      </div>

      {filteredSections.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-semibold text-foreground">Nie znaleziono instrukcji dla „{search}”</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Spróbuj wyszukać np. „mail”, „ksef”, „faktura”, „logo”, „koszt” lub zresetuj filtr.
          </p>
          <Button size="sm" variant="outline" onClick={() => setSearch("")} className="mt-4 text-xs">
            Pokaż wszystkie instrukcje
          </Button>
        </div>
      )}
    </div>
  );
}

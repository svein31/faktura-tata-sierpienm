import Link from "next/link";
import { pageCopy } from "@/lib/seo/metadata";
import { Logo } from "@/components/logo";
import { PUBLIC_ORIGIN, REVIEW_DATE, topicMap, topics, topicsFor, type Topic } from "@/lib/seo/content";

export function JsonLd({ value }: { value: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, "\\u003c") }} />;
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <nav aria-label="Poradniki i narzędzia" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <Link className="hover:text-primary" href="/program-do-faktur">Program</Link>
            <Link className="hover:text-primary" href="/faktury">Faktury</Link>
            <Link className="hover:text-primary" href="/poradnik-ksef">KSeF</Link>
            <Link className="hover:text-primary" href="/narzedzia">Narzędzia</Link>
            <Link className="hover:text-primary" href="/demo">Demo</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-border/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-4 text-xs text-muted-foreground sm:px-6">
          <span>© FakturaProsto · Informacje aktualizowane na podstawie źródeł urzędowych.</span>
          <div className="flex gap-4"><Link href="/pomoc">Kontakt</Link><Link href="/polityka-prywatnosci">Prywatność</Link><Link href="/regulamin">Regulamin</Link></div>
        </div>
      </footer>
    </div>
  );
}

export function TopicCards({ items }: { items: Topic[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(topic => <Link key={topic.path} href={topic.path} className="group rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:border-primary/60 hover:bg-primary/5">
        <h3 className="font-semibold group-hover:text-primary">{topic.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{topic.description}</p>
        <span className="mt-4 inline-block text-sm font-medium text-primary">Zobacz odpowiedź →</span>
      </Link>)}
    </div>
  );
}

export function PillarPage({ title, description, prefix }: { title: string; description: string; prefix: string }) {
  const group = topicsFor(prefix);
  const copy = pageCopy(prefix);
  const heading = copy?.h1 || title;
  const url = PUBLIC_ORIGIN + prefix;
  return <PublicShell>
    <JsonLd value={{ "@context": "https://schema.org", "@type": "CollectionPage", "@id": `${url}#page`, url, name: title, description, isPartOf: { "@id": `${PUBLIC_ORIGIN}/#website` }, inLanguage: "pl-PL" }} />
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">Praktyczne odpowiedzi</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{heading}</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">{description}</p>
      {copy?.answer && <section className="mt-7 max-w-3xl rounded-2xl border border-primary/30 bg-primary/5 p-5"><h2 className="font-semibold">{prefix === "/poradnik-ksef" ? "Co to jest KSeF 2.0?" : "Krótka odpowiedź"}</h2><p className="mt-3 leading-relaxed">{copy.answer}</p></section>}
      {prefix === "/poradnik-ksef" && <div className="mt-9 max-w-3xl space-y-7">
        <section><h2 className="text-xl font-semibold">Kogo dotyczy obowiązek i jakie są wyjątki?</h2><p className="mt-3 leading-relaxed text-muted-foreground">Zakres obowiązku zależy od podatnika i transakcji. Dla JDG sprawdź osobno wystawianie i odbiór faktur. Przejściowa zasada 10 000 zł brutto w 2026 roku dotyczy określonych faktur; po przekroczeniu limitu niższa sprzedaż w następnym miesiącu nie przywraca wyjątku. Nie utożsamiaj limitu z całym przychodem firmy.</p><Link className="mt-3 block text-primary underline" href="/poradnik-ksef/jdg">Obowiązki JDG i wyjątki →</Link></section>
        <section><h2 className="text-xl font-semibold">FA(3): format faktury ustrukturyzowanej</h2><p className="mt-3 leading-relaxed text-muted-foreground">FA(3) opisuje dane XML faktury, w tym strony, daty, pozycje i kwoty. PDF jest wizualizacją dokumentu; nie zastępuje wysyłki XML ani urzędowego potwierdzenia. Poprawność schematu i poprawność podatkowa to odrębne kontrole.</p><Link className="mt-3 block text-primary underline" href="/poradnik-ksef/fa3">Struktura FA(3) i kontrola danych →</Link></section>
        <section><h2 className="text-xl font-semibold">Od wysyłki do numeru KSeF i UPO</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Etap</th><th className="p-3">Co sprawdzić?</th></tr></thead><tbody>{[["Przygotowanie", "Dane stron, numer własny, daty, kwoty i schemat XML."], ["Kolejka lub przetwarzanie", "Zlecenie wysyłki nie potwierdza przyjęcia faktury."], ["Przyjęcie", "Numer KSeF oraz potwierdzenie UPO."], ["Odrzucenie", "Komunikat błędu; popraw dokument przed ponowieniem."], ["Wynik nieznany", "Sprawdź status w KSeF, zanim ponowisz wysyłkę."]].map(([stage, text]) => <tr key={stage} className="border-b"><td className="p-3 align-top font-medium">{stage}</td><td className="p-3">{text}</td></tr>)}</tbody></table></div><Link className="mt-3 block text-primary underline" href="/poradnik-ksef/upo">Pobieranie i przechowywanie UPO →</Link></section>
        <section><h2 className="text-xl font-semibold">Offline24, niedostępność i awaria</h2><p className="mt-3 leading-relaxed text-muted-foreground">Nie stosuj jednego terminu do wszystkich trybów. W offline24 przesłanie następuje co do zasady najpóźniej w następnym dniu roboczym po wystawieniu. Sposób udostępnienia dokumentu i kodów QR zależy od trybu i odbiorcy. Sprawdź certyfikat KSeF typu 2 oraz oficjalne zasady MF.</p><Link className="mt-3 block text-primary underline" href="/poradnik-ksef/offline24">Offline24: termin, odbiorca i kody QR →</Link></section>
        <section><h2 className="text-xl font-semibold">KSeF dla JDG i biura rachunkowego</h2><p className="mt-3 leading-relaxed text-muted-foreground">Ustal, kto wystawia, kto weryfikuje i kto pobiera dokumenty. Dostęp księgowej powinien wynikać z nadanej roli, a tokeny integracji pozostawać chronione. Przed zamknięciem miesiąca sprawdź szkice, nierozstrzygnięte wysyłki, brakujące UPO i akceptację kosztów.</p><Link className="mt-3 block text-primary underline" href="/program-do-faktur">Program i współpraca z księgową →</Link></section>
        <section><h2 className="text-xl font-semibold">Przykłady, kalkulatory i źródła MF</h2><p className="mt-3 text-sm text-muted-foreground">Redakcja FakturaProsto · aktualizacja treści: 2 października 2026 r. Sprawdź szczegóły swojej transakcji w aktualnych źródłach urzędowych.</p><a className="mt-3 block text-primary underline" href="https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/zakres-obowiazkowego-ksef/" target="_blank" rel="noopener noreferrer">Ministerstwo Finansów: zakres KSeF ↗</a><Link className="mt-3 block text-primary underline" href="/narzedzia/limit-ksef">Kalkulator limitu 10 000 zł →</Link></section>
      </div>}
      <section className="mt-9"><h2 className="mb-4 text-xl font-semibold">Wybierz temat</h2><TopicCards items={group} /></section>
      <div className="mt-12 flex flex-wrap gap-3 text-sm"><Link href="/narzedzia" className="rounded-xl border border-border px-4 py-2 hover:border-primary">Darmowe kalkulatory →</Link><Link href="/demo" className="rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground">Wypróbuj demo faktury →</Link></div>
    </main>
  </PublicShell>;
}

export function TopicPage({ topic }: { topic: Topic }) {
  const canonical = PUBLIC_ORIGIN + topic.path;
  const category = topic.path.split("/")[1];
  const related = topic.related.map(path => topicMap.get(path)).filter((item): item is Topic => !!item);
  return <PublicShell>
    <JsonLd value={{ "@context": "https://schema.org", "@graph": [
      { "@type": "WebPage", "@id": `${canonical}#page`, url: canonical, name: topic.title, description: topic.description, isPartOf: { "@id": `${PUBLIC_ORIGIN}/#website` }, inLanguage: "pl-PL" },
      { "@type": "Article", "@id": `${canonical}#article`, headline: topic.title, description: topic.description, mainEntityOfPage: { "@id": `${canonical}#page` }, author: { "@type": "Organization", "@id": `${PUBLIC_ORIGIN}/#editorial`, name: "Redakcja FakturaProsto", url: `${PUBLIC_ORIGIN}/pomoc` }, publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` }, datePublished: topic.publishedAt || REVIEW_DATE, dateModified: topic.modifiedAt || REVIEW_DATE, inLanguage: "pl-PL", citation: topic.sources.map(source => source.url) },
      { "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumbs`, itemListElement: [
        { "@type": "ListItem", position: 1, name: "Start", item: PUBLIC_ORIGIN },
        { "@type": "ListItem", position: 2, name: category === "poradnik-ksef" ? "KSeF" : category === "vat" ? "VAT" : "Faktury", item: `${PUBLIC_ORIGIN}/${category}` },
        { "@type": "ListItem", position: 3, name: topic.title, item: canonical },
      ] },
      ...(topic.path === "/faktury/jak-wystawic" ? [{ "@type": "HowTo", "@id": `${canonical}#howto`, name: topic.title, description: topic.answer, step: topic.sections.map((section, index) => ({ "@type": "HowToStep", position: index + 1, name: section.title, text: section.body })) }] : []),
    ] }} />
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <nav aria-label="Ścieżka strony" className="text-xs text-muted-foreground"><Link href="/" className="hover:text-primary">Start</Link> / <Link href={`/${category}`} className="hover:text-primary">{category === "poradnik-ksef" ? "KSeF" : category === "vat" ? "VAT" : "Faktury"}</Link> / Poradnik</nav>
      <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary">Odpowiedź · Aktualizacja {topic.modifiedAt || REVIEW_DATE}</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{topic.title}</h1>
      <div className="mt-7 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
        <h2 className="text-sm font-bold text-primary">Krótka odpowiedź</h2>
        <p className="mt-2 text-base leading-relaxed">{topic.answer}</p>
      </div>
      <div className="mt-10 grid gap-9 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-8">
          {topic.sections.map(section => <section key={section.title}>
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{section.body}</p>
          </section>)}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold">Przykład z wynikiem</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">{topic.example}</p>
          </section>
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
            <h2 className="font-semibold">Kiedy sprawdzić szczegóły?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{topic.caution}</p>
          </section>
          <section>
            <h2 className="font-semibold">Źródła urzędowe</h2>
            <ul className="mt-3 space-y-2 text-sm">{topic.sources.map(source => <li key={source.url}><a className="text-primary underline underline-offset-4" href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a></li>)}</ul>
            <p className="mt-3 text-xs text-muted-foreground">Autor: Redakcja FakturaProsto. Opracowujemy instrukcje produktu i poradniki na podstawie podanych źródeł urzędowych. <Link href="/pomoc" className="text-primary underline">Kontakt i zgłoszenie poprawki</Link>. W złożonej sytuacji sprawdź aktualne przepisy i szczegóły własnej transakcji.</p>
          </section>
        </div>
        <aside className="space-y-5">
          <div className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="font-semibold">Przejdź do działania</h2>
            <p className="mt-2 text-sm text-muted-foreground">Zobacz formularz przykładowej faktury bez rejestracji. Demo nie wysyła dokumentów do KSeF.</p>
            <Link href="/demo" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Otwórz demo →</Link>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="font-semibold">Powiązane tematy</h2>
            <ul className="mt-3 space-y-3 text-sm">{related.map(item => <li key={item.path}><Link className="text-primary hover:underline" href={item.path}>{item.title} →</Link></li>)}</ul>
          </div>
        </aside>
      </div>
      <div className="mt-12 border-t border-border/70 pt-8"><h2 className="text-xl font-semibold">Więcej odpowiedzi</h2><div className="mt-4"><TopicCards items={related.length ? related.slice(0, 4) : topicsFor(`/${category}`).filter(item => item.path !== topic.path).slice(0, 2)} /></div></div>
    </main>
  </PublicShell>;
}

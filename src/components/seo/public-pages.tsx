import Link from "next/link";
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
  const url = PUBLIC_ORIGIN + prefix;
  return <PublicShell>
    <JsonLd value={{ "@context": "https://schema.org", "@type": "CollectionPage", "@id": `${url}#page`, url, name: title, description, isPartOf: { "@id": `${PUBLIC_ORIGIN}/#website` }, inLanguage: "pl-PL" }} />
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">Praktyczne odpowiedzi</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-9"><TopicCards items={group} /></div>
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
      { "@type": "Article", "@id": `${canonical}#article`, headline: topic.title, description: topic.description, mainEntityOfPage: { "@id": `${canonical}#page` }, author: { "@id": `${PUBLIC_ORIGIN}/#organization` }, publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` }, datePublished: REVIEW_DATE, dateModified: REVIEW_DATE, inLanguage: "pl-PL", citation: topic.sources.map(source => source.url) },
      { "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumbs`, itemListElement: [
        { "@type": "ListItem", position: 1, name: "Start", item: PUBLIC_ORIGIN },
        { "@type": "ListItem", position: 2, name: category === "poradnik-ksef" ? "KSeF" : category === "vat" ? "VAT" : "Faktury", item: `${PUBLIC_ORIGIN}/${category}` },
        { "@type": "ListItem", position: 3, name: topic.title, item: canonical },
      ] },
    ] }} />
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <nav aria-label="Ścieżka strony" className="text-xs text-muted-foreground"><Link href="/" className="hover:text-primary">Start</Link> / <Link href={`/${category}`} className="hover:text-primary">{category === "poradnik-ksef" ? "KSeF" : category === "vat" ? "VAT" : "Faktury"}</Link> / Poradnik</nav>
      <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-primary">Odpowiedź · Sprawdzono {REVIEW_DATE}</p>
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
            <p className="mt-3 text-xs text-muted-foreground">Opracowanie FakturaProsto. W złożonej sytuacji sprawdź aktualne przepisy i szczegóły własnej transakcji.</p>
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
      <div className="mt-12 border-t border-border/70 pt-8"><h2 className="text-xl font-semibold">Więcej odpowiedzi</h2><div className="mt-4"><TopicCards items={topics.filter(item => item.path !== topic.path).slice(0, 2)} /></div></div>
    </main>
  </PublicShell>;
}

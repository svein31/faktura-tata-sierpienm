import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Demo faktury i symulacja KSeF",
  description: "Wypróbuj przykładową fakturę i symulację KSeF bez rejestracji. Nic nie trafia do produkcyjnego KSeF.",
  openGraph: { title: "Demo FakturaProsto", description: "Przykładowa faktura i symulacja KSeF bez rejestracji.", url: "/demo" },
  alternates: { canonical: "/demo" },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}

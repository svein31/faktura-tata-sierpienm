import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata("/demo", "Demo faktury i symulacja KSeF", "Wypróbuj przykładową fakturę i symulację KSeF bez rejestracji. Nic nie trafia do produkcyjnego KSeF.");

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}

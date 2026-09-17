import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Logowanie · FakturaProsto",
  description: "Zaloguj się do FakturaProsto — faktury i KSeF.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

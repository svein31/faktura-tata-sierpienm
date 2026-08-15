import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Logowanie · Fakturo",
  description: "Zaloguj się do Fakturo — faktury i KSeF.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

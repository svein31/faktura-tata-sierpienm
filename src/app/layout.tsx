import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast";
import { SessionProvider } from "@/lib/session-context";
import { CookieConsentBanner } from "@/components/legal/cookie-consent-banner";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://fakturaprosto.pl"),
  title: {
    default: "FakturaProsto — faktury online i KSeF",
    template: "%s · FakturaProsto",
  },
  description:
    "Wystawiaj faktury online i sprawdzaj status KSeF. Darmowe demo, praktyczne poradniki o fakturach i kalkulatory VAT.",
  openGraph: {
    type: "website",
    locale: "pl_PL",
    siteName: "FakturaProsto",
    title: "FakturaProsto — Faktury VAT i KSeF",
    description: "Faktury VAT, demonstracja działania i integracja z KSeF.",
  },
  twitter: { card: "summary" },
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#07090e" },
  ],
};

const themeScript = `
try {
  var t = localStorage.getItem('fakturaprosto-theme') || localStorage.getItem('fakturo-theme') || 'dark';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning className={`dark ${inter.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.className} font-sans bg-background text-foreground antialiased selection:bg-primary/25 selection:text-primary min-h-screen`}>
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>
              {children}
              <CookieConsentBanner />
            </SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

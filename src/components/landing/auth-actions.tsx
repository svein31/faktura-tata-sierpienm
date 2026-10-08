"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { useRouter } from "next/navigation";

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function useIntentPrefetch() {
  const router = useRouter();
  return (href: string) => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;
    router.prefetch(href);
  };
}

export function LandingHeaderActions() {
  const { status } = useSession();
  const prefetch = useIntentPrefetch();

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:gap-3">
      {status === "authenticated" ? (
        <Link prefetch={false} href="/dashboard" onPointerEnter={() => prefetch("/dashboard")} onFocus={() => prefetch("/dashboard")} className={`inline-flex min-h-11 min-w-0 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:min-h-9 sm:w-auto ${focus}`}>
          Przejdź do aplikacji <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <>
          <Link prefetch={false} href="/login" onPointerEnter={() => prefetch("/login")} onFocus={() => prefetch("/login")} className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-xl border border-border/70 px-3 text-sm font-medium text-foreground sm:min-h-9 sm:flex-none ${focus}`}>
            Zaloguj się
          </Link>
          <Link prefetch={false} href="/register" onPointerEnter={() => prefetch("/register")} onFocus={() => prefetch("/register")} className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground sm:min-h-9 sm:flex-none sm:px-4 ${focus}`}>
            Załóż konto
          </Link>
        </>
      )}
    </div>
  );
}

export function LandingPrimaryAction() {
  const { status } = useSession();
  const authenticated = status === "authenticated";
  const prefetch = useIntentPrefetch();
  const destination = authenticated ? "/dashboard" : "/register";
  return (
    <Link
      prefetch={false}
      href={destination}
      onPointerEnter={() => prefetch(destination)}
      onFocus={() => prefetch(destination)}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground sm:w-auto sm:px-7 ${focus}`}
    >
      {authenticated ? "Przejdź do aplikacji" : "Rozpocznij bezpłatnie"}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

export function LandingFooterActions() {
  const { status } = useSession();
  return status === "authenticated" ? (
    <Link prefetch={false} href="/dashboard" className={`font-medium text-primary ${focus}`}>Panel główny</Link>
  ) : (
    <>
      <Link prefetch={false} href="/login" className={focus}>Logowanie</Link>
      <Link prefetch={false} href="/register" className={focus}>Rejestracja</Link>
    </>
  );
}

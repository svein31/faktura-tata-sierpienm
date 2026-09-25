"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSession } from "@/lib/session-context";

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function LandingHeaderActions() {
  const { status } = useSession();

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:gap-3">
      {status === "authenticated" ? (
        <Link href="/dashboard" className={`inline-flex min-h-11 min-w-0 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:min-h-9 sm:w-auto ${focus}`}>
          Przejdź do aplikacji <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <>
          <Link href="/login" className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-xl border border-border/70 px-3 text-sm font-medium text-foreground sm:min-h-9 sm:flex-none ${focus}`}>
            Zaloguj się
          </Link>
          <Link href="/register" className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground sm:min-h-9 sm:flex-none sm:px-4 ${focus}`}>
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
  return (
    <Link
      href={authenticated ? "/dashboard" : "/register"}
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
    <Link href="/dashboard" className={`font-medium text-primary ${focus}`}>Panel główny</Link>
  ) : (
    <>
      <Link href="/login" className={focus}>Logowanie</Link>
      <Link href="/register" className={focus}>Rejestracja</Link>
    </>
  );
}

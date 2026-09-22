"use client";
export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div role="alert" className="max-w-xl rounded-xl border p-6 space-y-4"><h1 className="text-xl font-semibold">Nie udało się wyświetlić strony</h1><p>Spróbuj ponownie. Jeśli problem wraca, podaj obsłudze identyfikator: {error.digest || "brak"}.</p><button className="rounded-lg bg-primary text-primary-foreground px-4 py-3" onClick={reset}>Spróbuj ponownie</button></div>;
}

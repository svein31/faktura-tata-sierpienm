import * as React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useInvoiceSearch } from "../../src/lib/use-invoice-search";
import { useAppStore } from "./invoice-search-store";

type Reply = { invoices: { id: string }[]; total: number; counts: { all: number; sale: number; purchase: number; proforma: number; approved: number }; nextCursor: string | null };
type Pending = {
  id: number; url: string; aborted: boolean; settled: boolean; ignoreAbort: boolean;
  resolve: (data: Reply) => void;
  reject: (error: Error) => void;
};
type State = { search: string; status: string; enabled: boolean; invoices: string[]; loading: boolean; error: string; page: number; key: string };
const pending: Pending[] = [];
const reply = (id: string, nextCursor: string | null = null): Reply => ({
  invoices: [{ id }], total: 1, counts: { all: 1, sale: 1, purchase: 0, proforma: 0, approved: 0 }, nextCursor,
});

// Only the network transport is controlled. Keep the actual React effects,
// debounce, AbortController and document lifecycle from useInvoiceSearch.
window.fetch = ((input: RequestInfo | URL, options?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("/api/invoices/search?")) throw new Error(`Unexpected fixture request: ${url}`);
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const response = new Promise<Response>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  const request: Pending = {
    id: pending.length + 1, url, aborted: false, settled: false, ignoreAbort: false,
    resolve(data) { request.settled = true; resolve({ ok: true, json: async () => data } as Response); },
    reject(error) { request.settled = true; reject(error); },
  };
  pending.push(request);
  const abort = () => {
    request.aborted = true;
    if (!request.ignoreAbort && !request.settled) request.reject(new DOMException("Synthetic request aborted", "AbortError"));
  };
  options?.signal?.addEventListener("abort", abort, { once: true });
  if (options?.signal?.aborted) abort();
  return response;
}) as typeof fetch;

let state: State;
let controls: {
  search: (value: string) => void; status: (value: string) => void;
  enable: (value: boolean) => void; next: () => void; previous: () => void; reload: () => void;
};

function Fixture() {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [enabled, setEnabled] = React.useState(true);
  const result = useInvoiceSearch({ companyId: "synthetic-company", search, status }, enabled);
  state = { search, status, enabled, invoices: result.invoices.map(invoice => invoice.id), loading: result.loading, error: result.error, page: result.page, key: result.key };
  controls = {
    search: setSearch, status: setStatus, enable: setEnabled,
    next: result.next, previous: result.previous, reload: () => result.reload(),
  };
  return <main><h1>Real invoice search hook: synthetic transport only</h1><output id="search-state">{JSON.stringify(state)}</output></main>;
}

const root = createRoot(document.getElementById("root")!);
flushSync(() => root.render(<Fixture />));

// flushSync gives each test action a committed React update without advancing
// the fake clock; a 200 ms debounce cannot hide behind test-driver waits.
(window as unknown as { invoiceSearchTest: unknown }).invoiceSearchTest = {
  snapshot: () => ({ state, requests: pending.map(({ resolve: _resolve, reject: _reject, ...request }) => request) }),
  act: (action: keyof typeof controls, value?: string | boolean) => flushSync(() => {
    if (action === "search" || action === "status") controls[action](String(value));
    else if (action === "enable") controls.enable(Boolean(value));
    else controls[action]();
  }),
  respond: (id: number, row: string, cursor: string | null = null) => pending[id - 1].resolve(reply(row, cursor)),
  fail: (id: number, message: string) => pending[id - 1].reject(new Error(message)),
  ignoreAbort: (id: number) => { pending[id - 1].ignoreAbort = true; },
  mutate: () => flushSync(() => useAppStore.setState({ invoices: [{ id: "synthetic-mutation" }] })),
  unmount: () => flushSync(() => root.unmount()),
};

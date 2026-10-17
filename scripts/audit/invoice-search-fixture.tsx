import * as React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useInvoiceSearch } from "../../src/lib/use-invoice-search";
import type { InitialInvoiceSearch } from "../../src/lib/use-invoice-search";
import { useOverview } from "../../src/lib/use-overview";
import type { Overview, OverviewSeed } from "../../src/lib/use-overview";
import { useAppStore } from "./invoice-search-store";

type Reply = { invoices: { id: string }[]; total: number; counts: { all: number; sale: number; purchase: number; proforma: number; approved: number }; nextCursor: string | null };
type Pending = {
  id: number; url: string; aborted: boolean; settled: boolean; ignoreAbort: boolean;
  resolve: (data: unknown, status?: number, invalidJson?: boolean) => void;
  reject: (error: Error) => void;
};
type State = { companyId: string; search: string; status: string; enabled: boolean; invoices: string[]; total: number; counts: Reply["counts"]; nextCursor: string | null; loading: boolean; error: string; page: number; key: string };
const pending: Pending[] = [];
const history: State[] = [];
const params = new URLSearchParams(window.location.search);
const seedKind = params.get("seed");
const reply = (id: string, nextCursor: string | null = null): Reply => ({
  invoices: [{ id }], total: 1, counts: { all: 1, sale: 1, purchase: 0, proforma: 0, approved: 0 }, nextCursor,
});

// Only the network transport is controlled. Keep the actual React effects,
// debounce, AbortController and document lifecycle from useInvoiceSearch.
window.fetch = ((input: RequestInfo | URL, options?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("/api/invoices/search?") && !url.startsWith("/api/overview?")) throw new Error(`Unexpected fixture request: ${url}`);
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const response = new Promise<Response>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  const request: Pending = {
    id: pending.length + 1, url, aborted: false, settled: false, ignoreAbort: false,
    resolve(data, status = 200, invalidJson = false) {
      request.settled = true;
      resolve({ ok: status >= 200 && status < 300, status, json: async () => {
        if (invalidJson) throw new Error("Synthetic non-JSON response");
        return data;
      } } as Response);
    },
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
  company: (value: string) => void; search: (value: string) => void; status: (value: string) => void;
  enable: (value: boolean) => void; next: () => void; previous: () => void; reload: () => void;
};

const seedFilters = {
  companyId: seedKind === "wrong-company" ? "another-company" : "synthetic-company",
  search: "", status: seedKind === "wrong-filter" ? "paid" : "all",
};
const initialSearch: InitialInvoiceSearch | undefined = seedKind ? {
  url: `/api/invoices/search?${new URLSearchParams(seedFilters).toString()}&cursor=${seedKind === "wrong-cursor" ? "another-page" : ""}`,
  // The synthetic transport intentionally supplies only the row ID; all
  // observable hook state and every query/lifecycle operation remain real.
  data: {
    ...reply("server-seed", "seed-next-page"), total: 17,
    counts: { all: 17, sale: 9, purchase: 6, proforma: 2, approved: 3 },
  } as InitialInvoiceSearch["data"],
} : undefined;

function Fixture() {
  const [companyId, setCompanyId] = React.useState("synthetic-company");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [enabled, setEnabled] = React.useState(true);
  const result = useInvoiceSearch({ companyId, search, status }, enabled, initialSearch);
  state = { companyId, search, status, enabled, invoices: result.invoices.map(invoice => invoice.id), total: result.total, counts: result.counts, nextCursor: result.nextCursor, loading: result.loading, error: result.error, page: result.page, key: result.key };
  React.useLayoutEffect(() => { history.push(state); });
  controls = {
    company: setCompanyId, search: setSearch, status: setStatus, enable: setEnabled,
    next: result.next, previous: result.previous, reload: () => result.reload(),
  };
  return <main><h1>Real invoice search hook: synthetic transport only</h1><output id="search-state">{JSON.stringify(state)}</output>
    <ul aria-label="Visible invoice rows">{result.invoices.map(invoice => <li key={invoice.id}>{invoice.id}</li>)}</ul>
    {result.error && <p role="alert">{result.error}</p>}
  </main>;
}

type OverviewState = { companyId: string | null; months: 6 | 12 | 24; row: string | null; error: string };
let overviewState: OverviewState;
const overviewHistory: OverviewState[] = [];
let overviewControls: { company: (value: string) => void; months: (value: 6 | 12 | 24) => void; reload: () => void };
const overviewReply = (row: string): Overview => ({
  checkedAt: "2026-10-17T12:00:00.000Z",
  counts: { rejected: 0, uncertain: 0, overdue: 0, drafts: 0, offline: 0, reviews: 0, tasks: 0, missingUpo: 0, unmatched: 0 },
  actions: [], actionTotal: 0, currencies: ["PLN"], totals: [], currentMonth: [], previousMonth: [], months: [],
  vatByRate: [], statusCounts: [], contractors: [], ksefQueue: [],
  recent: [{ id: row, number: row, currency: "PLN", gross: 123, issueDate: "2026-10-17" }],
});
const initialOverview: OverviewSeed | undefined = seedKind ? {
  companyId: seedKind === "wrong-company" ? "another-company" : "synthetic-company",
  months: seedKind === "wrong-filter" ? 12 : 6, data: overviewReply("server-seed"),
} : undefined;

function OverviewFixture() {
  const [months, setMonths] = React.useState<6 | 12 | 24>(6);
  const result = useOverview(months, initialOverview);
  overviewState = { companyId: result.companyId, months, row: result.data?.recent[0]?.number ?? null, error: result.error };
  React.useLayoutEffect(() => { overviewHistory.push(overviewState); });
  overviewControls = {
    company: value => useAppStore.setState({ selectedCompanyId: value }),
    months: setMonths, reload: result.reload,
  };
  return <main><h1>Real overview hook: synthetic transport only</h1><output id="overview-state">{JSON.stringify(overviewState)}</output>
    {overviewState.row && <p data-overview-row>{overviewState.row}</p>}
    {result.error && <p role="alert">{result.error}</p>}
  </main>;
}

const root = createRoot(document.getElementById("root")!);
flushSync(() => root.render(params.get("mode") === "overview" ? <OverviewFixture /> : <Fixture />));

const requests = () => pending.map(({ resolve: _resolve, reject: _reject, ...request }) => request);
const http = (id: number, status: number, message: string, invalidJson = false) => pending[id - 1].resolve({ error: message }, status, invalidJson);

// flushSync gives each test action a committed React update without advancing
// the fake clock; a 200 ms debounce cannot hide behind test-driver waits.
(window as unknown as { invoiceSearchTest: unknown }).invoiceSearchTest = {
  snapshot: () => ({ state, history, requests: requests() }),
  act: (action: keyof typeof controls, value?: string | boolean) => flushSync(() => {
    if (action === "company" || action === "search" || action === "status") controls[action](String(value));
    else if (action === "enable") controls.enable(Boolean(value));
    else controls[action]();
  }),
  respond: (id: number, row: string, cursor: string | null = null) => pending[id - 1].resolve(reply(row, cursor)),
  http,
  fail: (id: number, message: string) => pending[id - 1].reject(new Error(message)),
  ignoreAbort: (id: number) => { pending[id - 1].ignoreAbort = true; },
  mutate: () => flushSync(() => useAppStore.setState({ invoices: [{ id: "synthetic-mutation" }] })),
  unmount: () => flushSync(() => root.unmount()),
};

(window as unknown as { overviewSeedTest: unknown }).overviewSeedTest = {
  snapshot: () => ({ state: overviewState, history: overviewHistory, requests: requests() }),
  act: (action: keyof typeof overviewControls, value?: string | number) => flushSync(() => {
    if (action === "company") overviewControls.company(String(value));
    else if (action === "months") overviewControls.months(Number(value) as 6 | 12 | 24);
    else overviewControls.reload();
  }),
  respond: (id: number, row: string) => pending[id - 1].resolve(overviewReply(row)),
  http,
  fail: (id: number, message: string) => pending[id - 1].reject(new Error(message)),
};

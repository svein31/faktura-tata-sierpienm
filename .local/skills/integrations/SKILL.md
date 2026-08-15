---
name: integrations
description: Search and manage Replit integrations including connectors and connections. Use for authentication, databases, payments, and third-party API integrations.
---

# Integrations Skill

Integrations give first-class access to third-party (and some first-party) services. When an integration exists, the user can "connect" their account (Google, Linear, GitHub, Stripe, etc.) to Replit, which gives you, the Replit Agent, new capabilities: view their Google Sheets, read their Linear issues, set up and access payment systems, and more. Follow the steps outlined here to make these connections.

**Before asking the user for any API key, secret, or credential, check the `## Integrations` view below for a Replit integration.** Replit integrations handle OAuth and secrets securely, and many common services (Google Sheets, Linear, Stripe, GitHub, OpenAI, etc.) are already supported. Asking the user for credentials when an integration exists adds a lot of unnecessary friction. Users typically do not know about the integration system, so proactively suggest it when — and only when — it is relevant.

Integrations include catalog connectors, configured connectors, and established connections.



## When to Use

Use this skill when:

- User needs authentication (login, signup, OAuth)
- User needs database connections (PostgreSQL, MongoDB, etc.)
- User needs payment processing (Stripe, etc.)
- User needs third-party API integrations (OpenAI, Notion, GitHub, Linear, etc.)

## When NOT to Use

For any request involving payments, billing, checkout, subscriptions, paywalls, ecommerce, or monetization, read the `monetization` skill before searching for or proposing integrations. The `monetization` skill is the source of truth for provider selection and which providers may appear in a shortlist. Do not build a payment-provider shortlist from generic `searchIntegrations` results or add other payment connectors that happen to match a broad search.

Do not use this skill for web search (use the web-search skill if available), searching files within the project, media generation (use the media-generation skill, including image generation APIs), or fetching data to answer a user's question (use the query-integration-data skill).

---

## Integration Lifecycle

Integrations come in three ID types across four statuses. Follow the status-driven lifecycle exactly:

```text
connector (not_setup)
    -- user completes OAuth via ProposeIntegration
    -- connection (added)         -- accepted proposals bind automatically; ready to use

connection (not_added)
    -- addIntegration             -- binds the existing authorization to the current environment
    -- connection (added)         -- ready to use

connection (added)
    -- no setup action            -- ready to use

connector_catalog (requires_setup)
    -- ProposeIntegration         -- creates/configures the connector and authorizes it inline
    -- connection (added)         -- bound to the current environment and ready to use
```

The `## Integrations` view and `searchIntegrations` name the same four statuses differently. This table is the canonical mapping — read every status through it:

| `## Integrations` view | `searchIntegrations` | Meaning | Action |
| --- | --- | --- | --- |
| `added` | `added` | bound to this environment | use it directly |
| `authorized` | `not_added` | authorized on the account, not bound here | `addIntegration` |
| `connectable` | `not_setup` | configured for the workspace, not authorized | `ProposeIntegration` |
| unconfigured tail | `requires_setup` | in the catalog, not configured | `ProposeIntegration` with `connector_catalog:<name>` |

### Connectors

- An available OAuth/API integration that has **not yet been authorized** by the user
- Status: `not_setup`
- Use `ProposeIntegration` with the exact returned ID. After acceptance, the server attaches the resulting connection automatically; do not call `addIntegration` afterward
- Example ID: `connector:ccfg_google-sheet_E42A9F6DA6...`

### Connections

- A connector that has **already been authorized** at the account level
- Status: `not_added` (authorized at account level but not bound to the current environment) or `added` (active in that environment)
- For `not_added`, call `addIntegration` once with the exact returned ID. In a Repl it binds to the Repl; in a conversation it binds to the conversation's sandbox
- For `added`, no setup action is needed unless runtime access fails with "not connected" or an authentication error
- Do not call `ProposeIntegration` after `addIntegration` unless runtime access then fails
- Example ID: `connection:conn_linear_01MG99PAJR6MQ5...`

For `not_setup` and `requires_setup`, call `ProposeIntegration` as soon as the user confirms they want the integration. The tool waits for the required authorization or setup and attaches the accepted connection automatically.

### Catalog Connectors

- A connector in the OpenInt catalog that does not yet have a workspace connector configuration
- Status: `requires_setup`
- Use `ProposeIntegration` directly with its exact `connector_catalog:<name>` id; it opens the inline setup flow and binds the resulting connection to the current environment
- Do not send the user to workspace Settings or call `addIntegration` first
- Example ID: `connector_catalog:google-calendar`

## Start from the Integrations view, not a search

When the `## Integrations` section lists rows with ids and statuses, it is the directory of everything you can act on. Read it before anything else, and act on a listed row directly instead of calling `searchIntegrations` to rediscover it. Each row carries the `id` to pass to the functions below, the `connector` slug (what `listConnections` is keyed on), and a `status` (read it through the mapping table above); the tail below the rows names the `connector_catalog:<name>` ids that still need setup. The view explains what to do with each status.

The view is a snapshot taken when the prompt was built. An `<automatic_updates>` entry about an integration takes precedence over it, including the id to act on.

## Choosing a Provider

- **Prefer what the user already has.** When more than one provider could serve a capability (email, calendar, files, CRM, enrichment), pick by status: `added` over `authorized` over `connectable` over anything unconnected. Never propose a new provider for a capability an already-connected integration covers without naming the connected one and saying why it does not fit.
- **A mention is not a connection.** The user naming a provider — or picking one from a menu, which leaves a connector chip (JSON with `"replit-type": "connector"`) in their message — does not mean it is connected. A chip `"status"` of `not_connected` means the provider must be proposed before use; every other chip — `connected` or no status — still acts through its matching `## Integrations` row or search result, whose id and status decide between direct use, `addIntegration`, and `ProposeIntegration`.
- **Pick providers out loud.** When a task implies a capability the user did not name (an enrichment source, an email sender, an SMS gateway), say which provider you intend to use and why before proposing or using it. Do not silently select one.

## Available Functions

`searchIntegrations`, `viewIntegration`, and `addIntegration` are available directly in the `codeExecution` sandbox. **Always use `console.log()` on return values** -- functions execute silently with no output if you don't. `ProposeIntegration` is a model tool, not a code execution callback; call it outside `codeExecution` when this skill tells you to prompt the user.

### searchIntegrations({ mode, queries?, statuses? })

**Last resort only.** The Integrations view above carries everything you need to act -- ids, statuses, slugs, and the unconfigured catalog. Search only when you cannot find what the user is asking for in the view:

- the view is absent, or is the installed-only shape (names only, no ids or statuses to act on)
- you need a capability search without a provider name ("image generation", "send SMS"), since the view's unconfigured tail carries names and catalog ids only
- the view or an `<automatic_updates>` entry says entries were truncated (`and N more`), and the one you want was not among those shown

Search mode accepts one to three alternative phrases and classifies them together in one model call. List mode performs no semantic search.

**Returns:** Dict with:

- `integrations`: list of integration objects, each with `id`, `displayName`, `description`, `integrationType`, and `status`

```javascript
const results = await searchIntegrations({
  mode: "search",
  queries: ["Google Sheets", "spreadsheet"],
});
console.log(results);
// { integrations: [{ id: 'connector:ccfg_google-sheet_...', displayName: 'Google Sheets',
//   description: '...', integrationType: 'connector', status: 'not_setup' }], ... }

// Always log -- calling without console.log produces no visible output!
for (const item of results.integrations) {
  console.log(`${item.id}  type=${item.integrationType}  status=${item.status}`);
}
```

**Notes:**

- Search mode is semantic, not exact-name or keyword matching. Broad discovery queries are valid, such as `queries: ["productivity integrations"]` or `queries: ["tools for managing customer support"]`.
- Use one focused phrase for a clear provider or capability. Add up to two alternatives when the request is broad or ambiguous, such as `queries: ["payments", "credit card processing", "billing"]`. Do not make separate searches for synonyms.
- When the user has not explicitly requested a provider, use capability-focused phrases so all relevant options can match.
- Use `{ mode: "list" }` to enumerate every integration, or add `statuses` to list/search only particular states.
- If a connector has already been authorized by the user or a teammate, it will appear as a `connection` (not a `connector`) in results
- The `id` field is the exact string to pass to subsequent functions

---

### viewIntegration({ integrationId })

Fetch full details and the code snippet for an integration without adding it to the project.

**Returns:** Dict with `integrationType`, `integrationId`, `displayName`, `renderedContent`

**Note:** `addIntegration` returns the exact same `renderedContent` blob, so in most cases you don't need to call this separately -- just read the result of `addIntegration`. The main reason to call `viewIntegration` first is if you want to inspect the package name, code snippet, or documentation URL before committing to the install.

```javascript
const info = await viewIntegration({ integrationId: "connection:conn_linear_01KG10PAJR6MQ525SQSWEB8QHC" });
console.log(info.renderedContent);  // Same blob you'd get from addIntegration
```

---

### addIntegration({ integrationId })

Bind an authorized connection to the current environment. Only pass a `connection:<id>` result with `status: not_added`; use `ProposeIntegration` for `not_setup` or `requires_setup` results.

**Returns:** Dict with:

- `success`: boolean
- `requiresConfirmation`: always `false` for connection results
- `connectionAlreadyAdded`: boolean -- True when the connection was already bound and no bind was needed. Either way a successful call leaves it bound
- `renderedContent`: same XML blob as `viewIntegration`

**Side effect:** Binds the connection to the current environment. It does not edit project files or install packages.

```javascript
const result = await addIntegration({ integrationId: "connection:conn_linear_01KG10PAJR6MQ525SQSWEB8QHC" });
console.log(result.success);          // true
console.log(result.renderedContent);  // SDK setup details
```

**After calling addIntegration:**

- Read `renderedContent` to get the code snippet
- Add any required package to application code explicitly when the snippet calls for it
- Do not call `ProposeIntegration` unless runtime access later fails
- The snippet handles token refresh and expiry -- use it as-is, don't simplify it
- Never cache the client object the snippet creates -- tokens expire

---

### ProposeIntegration({ proposal })

Propose a connector to the user. This is a **model tool**, not a code execution callback. It exits the agent loop immediately and waits for the user to complete OAuth or confirm setup. Nothing after this call will execute in the current loop.

**Returns:** Dict with `success`, `displayName`, `exitLoop` (always True)

**Use for:**

- Connectors with `status: not_setup` (drives OAuth + binding)
- Catalog connectors with `status: requires_setup` (creates/configures the connector, then authorizes and binds it inline)
- Connections with `status: added` only when runtime access fails with "not connected" or an authentication error (refreshes or rebinds the connection)

Always explain to the user what is about to happen, then call the `ProposeIntegration` tool with the exact id from the Integrations view or `searchIntegrations`, such as `{ proposal: [{ integrationId: "connector:ccfg_google-sheet_E42A9F6CA62546F68A1FECA0E8" }] }` or `{ proposal: [{ integrationId: "connector_catalog:google-calendar" }] }`.

**Notes:**

- After the user accepts either setup flow, the server attaches the resulting connection and returns its setup details; do not call `addIntegration` afterward
- There is no user-visible message automatically shown when this exits -- explain what you're doing in your chat response before calling it

---

## Using the Code Snippet

After `addIntegration` or `viewIntegration`, the `renderedContent` contains a code snippet. Key things to know:

1. **It is not on the filesystem.** Copy it into a new file in your project (e.g., `server/googleSheets.ts`)
2. **Never cache the client.** Tokens expire. The snippet exports a `getUncachable___Client()` function -- call it fresh on every request
3. **The token refresh logic is correct as-is.** Don't simplify or remove the expiry check
4. **The snippet uses environment variables** (`REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`, `WEB_REPL_RENEWAL`) that Replit injects automatically -- no setup needed
5. **The snippet is for app/server code, not the CodeExecution sandbox.** A bare `import` of the connector package only resolves where the package is installed (a workspace package's `node_modules`), so it fails from the sandbox's working directory with `ERR_MODULE_NOT_FOUND`. To reach a connector from inside CodeExecution, use the `listConnections("<connector-name>")` impure global instead -- it resolves the client without the package being installed and redacts tokens at the boundary. Identify the connector in the Integrations view or with `searchIntegrations` before you call it. `listConnections` is not a search or connection-status call. Pass the exact, non-empty connector slug, such as `listConnections("linear")`; calling it with no name or `""` throws `Error: listConnections requires a non-empty connector name string`. `listConnections` exists only inside a `"use impure"` function; calling it at the top level throws `ReferenceError: listConnections is not defined`, which means "wrap it in `"use impure"`," not "the API is missing" and not "install a package."

---

## Databricks

When the user wants to connect to Databricks, use the `databricks-m2m` connector (not the plain `databricks` connector). The `databricks-m2m` connector provides machine-to-machine access and works in all contexts. Inside a Databricks App, prefer the `databricks` (U2M) connector when available -- see the `databricks-app` skill for details.

## Common Pitfalls

- **Searching for a row the Integrations view already lists:** act on its id directly; `searchIntegrations` is the fallback for what the view does not cover
- **Not logging results:** `searchIntegrations` and all other functions return silently unless you `console.log()` the output
- **Calling addIntegration on a connector:** Will fail or behave unexpectedly. Check `integrationType` first
- **Sending catalog connectors to Settings:** `requires_setup` results are set up inline with `ProposeIntegration`; pass the exact `connector_catalog:<name>` id
- **Asking for API keys when a connection exists:** If a `not_added` connection exists, the user is already authenticated -- call `addIntegration` once. If it is `added`, use it directly.
- **Caching the client:** The boilerplate snippet is explicit about this. Tokens expire. Always call `getUncachable___Client()` fresh
- **Package installs:** `addIntegration` does not install packages. Follow the returned snippet's package instructions before using it in application code.
- **Added connection fails at runtime:** If an `added` connection returns "not connected" or an authentication error, call `ProposeIntegration` with its exact `connection:<id>` to refresh or rebind it, then retry

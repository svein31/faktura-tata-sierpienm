# Project profitability

Projects belong to one company. Current export permission is required to see cost rates and perform project commands. Project links and time records do not modify invoices, purchase approvals, original scans, payments or warehouse quantities.

Whole documents can be assigned to one project at a time. Source IDs are deterministic; the project version serializes concurrent commands. KSeF invoice/expense representations share an additional assignment claim. Linking checks current source ownership and accounting status. Unlinking requires a reason and retains a complete audit record; the source is preserved.

Revenue uses accounting sales invoices; purchase invoices require approval and expenses require verification. Drafts, proformas, cancelled or unavailable sources are excluded with a visible explanation. Source values are read again for each report, including closed projects. Closing a project prevents new project entries; it does not freeze source values or close an accounting month.

Two material cost bases are available at creation:

- Documents: material purchase costs contribute to the result; RW/WZ consumption is informational.
- Consumption: RW/WZ net inventory valuations contribute to the result; material purchase documents are informational.

Other costs and recorded labour cost contribute in either mode. Users must classify material purchases correctly and avoid entering labour already represented by a cost invoice. The entire document is assigned; splitting mixed invoices or allocating percentages is not provided in this release.

Time entries record work date, description, minutes, hourly cost and currency. Cost is minutes / 60 × hourly cost, rounded to two decimals. Separate currency buckets expose revenue, other costs, purchased and consumed materials, labour cost, profit and margin. No implicit conversion, exchange rate or sum across currencies is used.

The project list, source picker and detail entries are paginated in groups of 30. Summaries include every entry, not just the current page. A project supports up to 1000 entries; larger jobs can use separate stages/projects. Source reads use three batched queries rather than one request per entry. Details and totals are read within one database transaction.

Tests cover currency separation, material bases, time validation, source ownership, duplicate assignment, stale concurrent actions, current source amounts, cancelled consumption, archived-project guards and preserving originals after unlinking. Production data has not been migrated or changed.

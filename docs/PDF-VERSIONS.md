# Versioned invoice PDFs

Company owners publish append-only template versions (accent, classic/compact row spacing and plain-text footer). A versioned company setting selects the template for new issued documents. Stale concurrent setting updates return 409. Earlier template versions remain readable and can be copied into a new version.

Invoice creation, edits, offer/order conversion, recurring generation, settlement creation, incoming KSeF import and the outbound transmission claim capture print data inside their existing database transactions. Drafts remain live previews. The first issued capture freezes company, counterparty and template data. A financial/text edit creates a new immutable print-data version while retaining the previous versions. Operational changes such as payment or approval metadata are excluded from the rendering key. KSeF verification details can produce another print version without replacing prior versions.

Historical documents without a snapshot are explicitly labelled as captured on first rendering or first edit. The application cannot reconstruct company/contractor data that was overwritten before this feature existed.

Each PDF version is generated once and stored privately in MongoDB, with a SHA-256 digest. Concurrent renderers return the persisted winning bytes. Repeated downloads, the saved invoice Print/PDF button and stored-invoice email attachments use the same archive helper. Unsaved browser previews remain available. History is invoice-scoped, authenticated, paginated and does not expose encoded PDFs or full source payloads. Source snapshots exclude tokens, XML, UPO and operational history.

Original company logos embedded as PNG/JPG data URLs are captured with the party context. Legacy remote logos are fetched at first PDF generation; their prior remote bytes cannot be reconstructed. Remote requests require public HTTPS, pinned IPv4 resolution, no redirects, short timeouts and a 2 MB image limit. Persisted PDFs never refetch their logo. Store an embedded company logo for capture at issuance.

The renderer now wraps full line descriptions and party names/addresses, paginates rows and full notes, repeats table headers and numbers every page. Classic and compact layouts retain the existing PDF calculation and KSeF information. The existing standard-font Polish transliteration remains; full Unicode fonts are not introduced in this slice. Maximum archive PDF size is 6 MB.

Verification includes a 60-line, five-page visual fixture, unit checks for pagination/config/secret exclusion/remote-image security, and MongoDB HTTP integration checks for issued snapshots, version isolation, company and counterparty changes, edited revisions, identical repeated downloads and template conflicts. No test sends email to a real recipient or contacts live KSeF.

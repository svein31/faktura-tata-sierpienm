# OCR document review

OCR is optional. Upload and manual review remain available without provider credentials.
Original PDF/JPG/PNG data remains in the private MongoDB document store, bounded to 3 MB per upload; the application never publishes a storage URL. Viewing the original requires current company access. A company-specific SHA-256 identity deduplicates uploads without sharing another company's files.

POST /api/documents/:id/ocr queues one durable job for the current document version. The authenticated document screen can start processing immediately; the Netlify minute schedule handles jobs after the tab closes. Configure OCR_SPACE_API_KEY, CRON_SECRET and HTTPS APP_URL (or Netlify URL). Provider plan limits may be lower than the upload limit. No provider credentials are exposed to the browser.

Workers claim a 120-second lease within a MongoDB transaction, recheck the enqueuer's current permissions and invoke OCR.space outside the transaction with a 20-second timeout. Transient errors retry at most three times with backoff. A crashed worker's lease can be reclaimed. The lease token and scan version prevent an old worker from replacing a later result or manual decision. Manual saves and decisions cancel queued/in-flight jobs atomically.

The provider response must confirm success for every page. Empty, partial and oversized responses are rejected. Structured proposals preserve source page, line and text. Ambiguous values stay separate; absent field confidence stays null. The parser only extracts explicitly labelled values and table columns, never interprets a VAT rate as an amount or a remaining balance as invoice gross.

OCR results and human review are separate fields. Using a proposal is explicit. Optional reviewed lines must have valid quantities, nonnegative amounts, net+VAT=gross and totals matching the document. Approval requires acknowledgement that OCR data was compared with the original. Approval creates one expense within the same transaction as the immutable document decision and accounting-period guard. OCR never approves or creates costs by itself.

Validation includes parser/provider unit tests and isolated MongoDB tests with a fake provider for concurrency, bounded retries, lease recovery, late results, manual edits and revoked access. No production database or external OCR provider is used by those tests.

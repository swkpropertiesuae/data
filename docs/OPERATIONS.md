# Operations

Production: https://data.swk.rent/

The application runs in the SWK Cloudflare account as Worker `swk-data`. Public data records are indexed in the dedicated `swk-data` D1 database. Original archive files and refreshed aggregates are preserved in the dedicated `swk-data-archive` R2 bucket. Existing SWK Workers and the swk.rent apex were not modified.

## Deployment

Run `npm run build`, `npm run check`, and `npm test`. With a narrowly scoped `CLOUDFLARE_API_TOKEN` supplied through the environment, run `node scripts/deploy.mjs`. Account/resource identifiers in deployment.json are configuration, not credentials. The token needs the relevant Workers, D1, R2 and Workflows permissions. GitHub Actions currently validates changes; it does not contain an account token or silently promise automatic deployment.

No dependency installation is needed. The application uses platform bindings and Node built-ins for development and tests. Use Node 24.

## Data refresh and imports

The accepted refresh schedule is daily at 03:15 UTC / 07:15 Dubai. It refreshes bounded DataDubai aggregate datasets and preserves prior rows if upstream acquisition fails. Publisher dates are independent of ingestion timestamps. Failed staged imports are not exposed as live records.

The historical source is a fixed snapshot through 2026-11-02, not a live transactions feed. A one-time Cloudflare Workflow streams the CSV and Parquet into R2 and indexes the CSV in resumable steps. The import has a 350 MiB archive cap, at most 175 indexing steps and at most two retries per step. Unique transaction IDs make replay idempotent. Do not start parallel import instances against the same cursor.

The original initial indexing instance was terminated after successful checkpoints to apply a batch-write optimization. The replacement continues from the saved cursor and uses INSERT OR IGNORE. No imported records need to be deleted.

One-time workflow names: `swk-data-import` (DataImport), `swk-data-seed` (SeedImport), `swk-data-ajman` (AjmanImport). The Ajman importer checks a declared reuse licence, limits each export to 24 MB / 40,000 rows and preserves old datasets on failure. It records blocked/unavailable results and never labels them loaded.

The daily refresh does not scrape Bayut, Property Finder, private CRM contacts or unlicensed media. Those services remain catalogued with access requirements. Investor identity/contact databases are not public market datasets.

## AI and privacy

Cloudflare Workers AI binding `AI` uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Numerical answers retrieve structured records first. The model sees bounded evidence, has no arbitrary SQL or URL tool, and may not invent values. A numerical-evidence check replaces unsupported output with a deterministic record summary. This reduces error; it does not make the model infallible.

AI synthesis is capped at 100 requests per UTC day globally and 10 per visitor per day, with at most 900 generated tokens. After that the data search and deterministic answers continue. Rate-limit identifiers are day-rotating IP hashes. Raw chat content is not persisted in the application database. Conversations are saved in the visitor's browser; Clear conversations removes those browser copies. Do not send private investor data into a public chat.

Logs record event names and errors, not full chat prompts. Source documents and user questions are untrusted inputs. Origin checks, request size limits, prepared search parameters, restrictive response headers, HTML escaping and spreadsheet-formula neutralization are implemented.

## Verification

`GET /api/health`, `GET /api/stats`, `GET /api/datasets` and `GET /api/sources` expose coverage. Dataset counts come from the database. `sales_import.complete` is distinct from archive download completion. Full historical archive downloads are available only after R2 acquisition succeeds. Filtered CSV exports have a 10,000-row cap; full original archives are separate downloads.

Check Cloudflare Workflow status for failures and D1 dataset_status/ingest_state for source-specific progress. Do not call the corpus complete for all UAE real estate: some sources are summaries, some require permissions, some are commercial, and some emirates do not expose a verified public bulk feed.

## Remaining integrations

Access-approved ADREC exports/API, verified additional DLD registers, authorised developer inventory, licensed listing feeds, current published investor reports, geospatial subsets, and consented SWK CRM integrations can be added through separate adapters. Each needs a publisher, licence/access basis, date and coverage test before being shown as imported. These are integration opportunities, not currently indexed facts.

## Verified initial production import

On 6 November 2026, database COUNT confirmed 1,382,848 historical sales and the source checkpoint reached byte 240,530,566 with complete=true. All nine official Ajman exports were acquired with declared CC BY 4.0 metadata and indexed (67,820 source rows). Combined with 9,260 Dubai summary/reference rows, production holds 1,459,928 searchable records in 24 datasets. See data/production-import.json. These counts overlap conceptually and must not be added to infer unique people, properties or events.

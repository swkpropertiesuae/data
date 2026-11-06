# SWK DATA

**Live application: https://data.swk.rent/**

SWK-branded UAE property research with a conversational search interface, evidence tables, cited answers, a record explorer, CSV exports and a transparent source catalogue.

As verified on 6 November 2026: **1,459,928 searchable records across 24 imported datasets**, plus an 83-source catalogue.

## What is included

- Original supplied SWK identity assets; warm neutral interface with restrained gold accents.
- 12 genuine DataDubai CSV datasets: 9,208 aggregate rows, source snapshot through 29 October 2026.
- Two additional DataDubai JSON references: 46 community service-charge observations for budget year 2026 and six stock/pipeline summary rows.
- A fixed historical DLD sales snapshot published by Dubai Real Estate Data: **1,382,848 verified indexed records** through 2 November 2026. Original CSV and Parquet archives are preserved in R2.
- 83 catalogue entries spanning DLD registers, rents, projects, valuations, developers, brokers, investor reports, ADREC, Ajman, RAK, national statistics, geospatial sources, commercial APIs and scraping tools.
- Nine official Ajman public datasets imported successfully: **67,820 records**, covering unit sales/transactions/registrations, projects, land sales/transactions, office records, classifications and licensed activities. Source dates vary from June to August 2026.
- Workers AI summaries grounded in retrieved records, with deterministic fallback, numerical checks and daily inference caps.
- Daily DataDubai refresh at 07:15 Dubai time, plus finite, resumable archive import workflows.
- Browser-local research history, source dates, provenance, quality fields and clear loaded/catalogued/access-dependent status.

This is not every UAE dataset or an investor contact database. A source being catalogued does not mean its records are indexed. Public records, transaction amounts, listing advertisements, estimates and marketing materials have different meanings and rights. Read each source's coverage and access status.

## Use locally

Requires Node 24; there are no npm dependencies.

```sh
npm run build
npm run dev
```

The local development adapter uses Node SQLite with the checked-in aggregate files. Local AI is intentionally disabled; deterministic record answers work without external credentials. Production uses the real Cloudflare D1, R2 and AI bindings.

```sh
npm run check
npm test
```

## Repository structure

| Path | Purpose |
|---|---|
| `public/` | Responsive interface and original SWK brand assets |
| `src/worker.mjs` | API, retrieval, evidence validation and request handling |
| `src/retrieval.mjs` | Intent selection, aliases, facts and numerical guard |
| `src/ingestion.mjs` | Bounded refresh, streamed archives and resumable bulk indexing |
| `src/workflow.mjs` | One-time durable import jobs |
| `src/ajman.mjs` | Permission-aware official Ajman export adapter |
| `data/seed/` | 12 imported aggregate CSVs, with original headers |
| `data/references/` | Original JSON reference snapshots |
| `data/catalog.json` | Source registry and access classifications |
| `data/manifest.json` | CSV hashes, schemas, counts, dates and source commit |
| `data/archive-manifest.json` | Bulk source and production download pointers |
| `docs/` | Source details, attribution and operations |

Large historical archives live in object storage rather than Git. The repository carries their provenance, reproducible acquisition code and download links. Bulk files are not silently split into misleading partial CSVs to fit GitHub's individual-file limits.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/chat` | JSON `{ "question": "Compare JVC and Business Bay" }` |
| `GET /api/stats` | Actual imported counts, archive state and indexing progress |
| `GET /api/sources` | Source catalogue and current imported status |
| `GET /api/datasets` | Available datasets and fields |
| `GET /api/records?dataset=communities&search=Business%20Bay` | Parameterized record search and pagination |
| `GET /api/export?dataset=communities` | CSV, capped at 10,000 matching rows |
| `GET /api/archive?file=dld_sales_transactions.parquet` | Full licensed historical archive |
| `GET /api/archive?dataset=ajman_real-estate-units-sales` | Full original official Ajman JSON export |

## Attribution and limitations

DataDubai CSV aggregates: **Dubai Data (datadubai.ae), Continental Club Property — based on Dubai Land Department open data**, CC BY 4.0. Additional DataDubai JSON references retain the publisher's attribution and source-link requirements. Historical sales: **Dubai Real Estate Data (dubairealestatedata.com), based on Dubai Land Department open data**, stated CC BY 4.0. SWK is an independent platform, not a government service or an endorsed DLD product.

Gross yields exclude costs and vacancy. Construction percentages reflect the last inspection. Registered project units do not establish delivered supply. Some source snapshots are older than the retrieval date. No private investor, tenant, buyer or owner identity list is included.

See [source documentation](docs/DATA_SOURCES.md), [attribution](data/ATTRIBUTION.md) and [operations](docs/OPERATIONS.md). GitHub Actions validates changes; deployment requires account authorization through the deployment environment.

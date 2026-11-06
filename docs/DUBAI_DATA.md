# Dubai Data direct integration

SWK DATA uses Dubai Data's public read-only MCP service directly from its Cloudflare backend. There is no account sign-in, browser scraping, private owner registry or API key involved in this connection.

- Application: https://data.swk.rent/
- Publisher documentation: https://datadubai.ae/mcp/
- MCP endpoint: https://mcp.datadubai.ae/mcp
- Publisher methodology: https://datadubai.ae/methodology/
- Publisher sources: https://datadubai.ae/sources/
- Publisher privacy: https://datadubai.ae/privacy/

Dubai Data is operated by Continental Club Property and is independent of Dubai Land Department. Credit its calculations separately from the underlying DLD open data.

## What the connection does

| Question | Retrieval |
|---|---|
| Compare JVC and Business Bay | Resolve public names and fetch each community's published entity record |
| Azizi Venice 14 prices and construction progress | Project summary, registered sales and last-inspected registry fields |
| Show Azizi Venice projects | Search results with project names, prices and construction fields |
| JVC one-bedroom rents | Published bedroom breakdown with quality and suppression fields |
| JVC monthly prices for September 2026 | Filter that entity's published monthly history |
| Which communities have the highest gross yields? | Published yield ranking, including its methodology |
| Summarise the Dubai market for September 2026 | Published monthly report and key figures |
| Show the Dubai property market | City-wide summary, with dates and observation window |
| Service charges / registered stock | Public JSON reference feed |
| Individual historical transactions | Existing imported historical sales table |
| Investor identities or contacts | No personal database lookup |
| Other emirates | Existing imported data or official source guidance |

The connection implements initialization, negotiated protocol versions, initialized notification, bounded tool discovery, JSON-RPC calls, JSON and SSE responses, session headers and session termination. It permits only `search`, `get_entity`, `get_market_summary`, `get_monthly_report` and `list_rankings`. Returned instructions cannot select tools or change the application's permissions. The publisher's separate readable `fetch` tool is not required by this adapter.

Known imported entity URLs can be resolved without sending the full question. Unknown names use a short, filtered search phrase. Full conversations, visitor IPs, emails, keys and credentials are not sent to Dubai Data. The publisher may log public tool arguments under its own privacy policy.

## MCP and JSON

MCP is preferred for search, entities, rankings and reports. For an entity with a verified publisher URL, the corresponding public `.json` mirror is a fallback. Long MCP records marked truncated may be replaced with a validated public JSON mirror when available. Mirror records keep their own data cutoff, even when it differs from the MCP wrapper date. Service-charge and stock references use their published JSON feeds directly.

Only HTTPS URLs on exactly `datadubai.ae` are eligible. Redirects are not followed. User input cannot select a host, endpoint or tool. Responses are limited to one MiB and the provider query has a 22-second deadline. Errors return a dated cache response or the imported snapshot. Failed source retrieval does not remove previously imported data.

## Cache and cost limits

The additive `provider_cache` D1 table contains published responses, a hashed operation/argument key, fetch time and expiry. Fresh results are reusable for six hours across requests. If the provider fails, a previous response can be served for up to seven days and is marked as stale. After that the application falls back to imported records. Old entries are removed by the existing daily refresh; no additional schedule is created.

Cache misses are limited to 200 direct queries globally and 20 per visitor per UTC day. A visitor is represented by a daily rotating hash, not a stored IP address. Cache hits do not spend another direct-query allowance. Workers AI's existing global 100/day and per-visitor 10/day inference limits remain separate. Deterministic answers continue after the AI limit is reached.

## Evidence and downloads

Every answer identifies whether it used a direct response, cache or saved import. Rows preserve source cutoffs, and citations link the original entity, report or ranking page. Fetch time is shown in Dubai time. Different source cutoffs in a comparison are displayed separately. Bedroom sample quality and null/suppressed values are retained. An absent rental yield is not converted to zero.

Direct answers have their own CSV download containing the displayed fields, source URL, cutoff, fetch time and transport. The existing data explorer and bulk exports continue to represent imported snapshots. A direct lookup does not silently increase imported dataset or transaction counts.

Project progress is the last recorded inspection, not live construction tracking. Declared completion dates may have passed or may change. Registry supply includes approved projects and is not delivered supply. Gross yields exclude costs. Published developer project lists or truncated records do not establish a complete developer registry count.

## Operations and verification

`GET /api/providers` returns enabled state, the last successful MCP connection, negotiated protocol, allowed discovered tools and the last response-fetch time. It is stored telemetry, not a request that polls the publisher continuously.

Production uses `DUBAI_DATA_ENABLED=true`. Set it to `false` to return to imported-data retrieval. No private token is needed. `scripts/deploy.mjs` creates the new cache table before Worker upload, preserving existing D1 property tables.

Run:

```sh
npm run build
npm run check
npm test
```

Automated checks cover real imported records, direct API routing, SSE transport and chunking, session negotiation, wrong IDs, oversized responses, native Worker fetch binding, caching, budgets, JSON fallback, older source dates, stale expiry, private-data boundaries, and comparison citations. Live Cloudflare verification additionally checks the actual public MCP service and the production interface. Both fallback modes are bounded; neither downloads every underlying DLD record from MCP.

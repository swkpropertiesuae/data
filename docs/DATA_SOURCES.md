# SWK DATA source registry

This repository contains **12 imported aggregate datasets with 9,208 rows**, plus a source registry. It does **not** contain every UAE property record or private investor contact information. A catalog entry is not evidence that its records are loaded, licensed for redistribution, or currently reachable.

## Imported data

- Publisher: Dubai Data / Continental Club Property, based on Dubai Land Department open data.
- Snapshot cutoff: **29 October 2026**.
- Upstream commit: `c2d2bffa267ce9884105fd4af1fce83a9673ddc8`.
- Licence: **CC BY 4.0** (as declared by the publisher).
- Attribution: **Dubai Data (datadubai.ae), Continental Club Property — based on Dubai Land Department open data, data through 2026-10-29.**
- Text files have LF line endings; field names and values are otherwise retained.

| File | Rows |
|---|---:|
| `data/seed/areas.csv` | 97 |
| `data/seed/communities.csv` | 111 |
| `data/seed/community_bedrooms.csv` | 418 |
| `data/seed/community_monthly.csv` | 5722 |
| `data/seed/community_yearly.csv` | 1403 |
| `data/seed/developers.csv` | 367 |
| `data/seed/market_bedrooms.csv` | 6 |
| `data/seed/market_monthly.csv` | 120 |
| `data/seed/market_yearly.csv` | 17 |
| `data/seed/projects.csv` | 770 |
| `data/seed/rents_by_community.csv` | 102 |
| `data/seed/yields_by_community.csv` | 75 |

Rows count observations across aggregate tables. One sale can contribute to several tables, so 9,208 is not a sales or unique-property count. The underlying registry totals mentioned in publisher descriptions are not the number of records imported here.

## Interpretation

- Sales prices are registered values. Asking prices from advertisements are a different measure.
- Missing cells mean unknown/not published, not zero.
- Gross yield excludes service charges, vacancy, financing, fees and transaction costs.
- Project completion is the last reported inspection state; dates can be developer-declared.
- Marketing communities and DLD administrative areas must not be joined by an unverified fuzzy name match.
- Preserve sample sizes and quality flags in every derived answer.

## Source statuses

| Status | Meaning |
|---|---|
| loaded | Actual local CSV is included and available to index. |
| catalogued | Source/reference identified; records have not been imported. |
| permission_required | An approval, account, licence clarification, or first-party authorisation is needed. |
| paid | Commercial agreement and credentials are required. |
| unavailable | A coverage gap or unreachable/unverified source. |

## Historical transaction snapshot

The independent publisher Dubai Real Estate Data documents a downloadable **1,382,848-row, 20-column** DLD sales snapshot through **2 November 2026**. CSV (~241 MB) and Parquet (~22.8 MB) are present in the Hugging Face file tree. It is catalogued separately as `hf_sales`; it is not included in the 9,208 seed rows.

- Source: https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions
- Dictionary: https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions/raw/main/DATA_DICTIONARY.md
- Natural key: `transaction_id`.
- Columns: `transaction_id, instance_date, reg_type_label, area_id, area_name_en, project_name, master_project_name, building_name, property_type_label, property_sub_type, usage_label, rooms_bucket, has_parking, area_sqm, price_aed, price_psf, procedure_id, procedure_name_en, is_pre_registration, quality_flags`.
- Use all registered sales for count/value metrics. For the publisher's residential built-home price-per-sqft benchmark, restrict to `quality_flags = 0`, `property_type_label IN ('Unit', 'Villa')`, and `usage_label = 'Residential'`.
- Publisher attribution: Dubai Real Estate Data (dubairealestatedata.com), based on Dubai Land Department open data.

## Refresh commands

```bash
python3 scripts/ingest.py                    # refresh the 12 allowlisted public CSVs
python3 scripts/ingest.py --manifest-only    # validate existing seeds and rebuild manifest
python3 scripts/ingest.py --ajman            # additionally download allowlisted Ajman exports
python3 scripts/ingest.py --full-sales       # additionally download historical Parquet outside Git
python3 scripts/ingest-catalog.py            # rebuild explicit source registry
```

The optional downloads are marked downloaded-but-not-indexed until the application imports them. The downloader validates format, preserves previous good files after download/schema failures, reports errors, and never bypasses CAPTCHA or login. `data/raw/` is intended for large source archives and must be excluded from ordinary Git commits.

Ajman granularity and licences vary by dataset. Public official-portal access is not a general permission to republish portal advertisements or third-party copyrighted materials. Bayut and Property Finder have restrictive automated-collection and commercial-reuse terms. No scraper has been executed.

## Catalog

Public source catalogue: 88 entries. Direct-feed statuses are overlaid by the production API; a catalogue entry alone is not an import.

| ID | Source | Emirate | Status |
|---|---|---|---|
| `datadubai_areas` | [Dubai Data · Areas](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/areas.csv) | Dubai | loaded |
| `datadubai_communities` | [Dubai Data · Communities](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/communities.csv) | Dubai | loaded |
| `datadubai_community_bedrooms` | [Dubai Data · Community Bedrooms](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/community_bedrooms.csv) | Dubai | loaded |
| `datadubai_community_monthly` | [Dubai Data · Community Monthly](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/community_monthly.csv) | Dubai | loaded |
| `datadubai_community_yearly` | [Dubai Data · Community Yearly](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/community_yearly.csv) | Dubai | loaded |
| `datadubai_developers` | [Dubai Data · Developers](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/developers.csv) | Dubai | loaded |
| `datadubai_market_bedrooms` | [Dubai Data · Market Bedrooms](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/market_bedrooms.csv) | Dubai | loaded |
| `datadubai_market_monthly` | [Dubai Data · Market Monthly](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/market_monthly.csv) | Dubai | loaded |
| `datadubai_market_yearly` | [Dubai Data · Market Yearly](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/market_yearly.csv) | Dubai | loaded |
| `datadubai_projects` | [Dubai Data · Projects](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/projects.csv) | Dubai | loaded |
| `datadubai_rents_by_community` | [Dubai Data · Rents By Community](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/rents_by_community.csv) | Dubai | loaded |
| `datadubai_yields_by_community` | [Dubai Data · Yields By Community](https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/yields_by_community.csv) | Dubai | loaded |
| `dld_transactions` | [DLD · Transactions](https://dubailand.gov.ae/en/open-data/real-estate-data) | Dubai | catalogued |
| `dld_rents` | [DLD · Rents / Ejari contracts](https://dubailand.gov.ae/en/open-data/real-estate-data) | Dubai | catalogued |
| `dld_projects` | [DLD · Project registry](https://dubailand.gov.ae/en/open-data/real-estate-data) | Dubai | catalogued |
| `dld_valuations` | [DLD · Valuations](https://dubailand.gov.ae/en/open-data/real-estate-data) | Dubai | catalogued |
| `dld_land` | [DLD · Land](https://dubailand.gov.ae/en/open-data/real-estate-data) | Dubai | catalogued |
| `dld_buildings` | [DLD · Buildings](https://dubailand.gov.ae/en/open-data/real-estate-data) | Dubai | catalogued |
| `dld_units` | [DLD · Units](https://dubailand.gov.ae/en/open-data/real-estate-data) | Dubai | catalogued |
| `dld_brokers` | [DLD · Broker register](https://dubailand.gov.ae/en/open-data/real-estate-data) | Dubai | catalogued |
| `dld_developers` | [DLD · Developer register](https://dubailand.gov.ae/en/open-data/real-estate-data) | Dubai | catalogued |
| `dubai_data_exchange` | [Government Data Dubai / Dubai Pulse](https://data.dubai/) | Dubai | catalogued |
| `dld_rental_index` | [DLD Rental Index](https://dubailand.gov.ae/en/eservices/rental-index/) | Dubai | catalogued |
| `dld_residential_sales_index` | [DLD Residential Sales Price Index](https://dubailand.gov.ae/en/open-data/residential-properties-price-index-rppi) | Dubai | catalogued |
| `dld_rental_performance` | [DLD Residential Rental Performance Index](https://dubailand.gov.ae/en/open-data/residential-rental-performance-index/) | Dubai | catalogued |
| `dld_api` | [DLD API Gateway](https://dubailand.gov.ae/en/eservices/api-gateway-registration?appId=15) | Dubai | permission_required |
| `dld_research` | [DLD Research and Investor Reports](https://dubailand.gov.ae/en/open-data/research/) | Dubai | catalogued |
| `dld_golden_visa` | [DLD Golden Visa Investor Service](https://dubailand.gov.ae/en/eservices/request-for-golden-visa-investor/) | Dubai | catalogued |
| `dld_service_charges` | [DLD / RERA Service Charge Reference](https://dubailand.gov.ae/en/) | Dubai | catalogued |
| `datadubai_service_charges` | [Dubai Data Service Charges](https://datadubai.ae/service-charges/) | Dubai | catalogued |
| `datadubai_construction` | [Dubai Data · Construction bands](https://datadubai.ae/construction/) | Dubai | catalogued |
| `datadubai_stock` | [Dubai Data · Residential Stock and Pipeline](https://datadubai.ae/stock/) | Dubai | catalogued |
| `datadubai_transactions` | [Dubai Data · Latest publisher transactions](https://datadubai.ae/transactions/) | Dubai | catalogued |
| `datadubai_mortgages` | [Dubai Data · Mortgages and gifts](https://datadubai.ae/mortgages/) | Dubai | catalogued |
| `datadubai_compare` | [Dubai Data · Community Comparisons](https://datadubai.ae/) | Dubai | catalogued |
| `datadubai_mcp` | [Dubai Data Public MCP](https://datadubai.ae/mcp/) | Dubai | catalogued |
| `adrec_market` | [ADREC Market Data](https://adrec.gov.ae/en/market-data) | Abu Dhabi | catalogued |
| `adrec_reports` | [ADREC Market Reports](https://adrec.gov.ae/property_and_index) | Abu Dhabi | catalogued |
| `ajman_real-estate-units-sales` | [Ajman · Unit Sales](https://data.ajman.ae/explore/dataset/real-estate-units-sales/) | Ajman | catalogued |
| `ajman_real-estate-units-transactions` | [Ajman · Unit Transactions](https://data.ajman.ae/explore/dataset/real-estate-units-transactions/) | Ajman | catalogued |
| `ajman_real-estate-units-registration` | [Ajman · Unit Registrations](https://data.ajman.ae/explore/dataset/real-estate-units-registration/) | Ajman | catalogued |
| `ajman_real-estate-projects` | [Ajman · Development Projects](https://data.ajman.ae/explore/dataset/real-estate-projects/) | Ajman | catalogued |
| `ajman_lands-sales` | [Ajman · Land Sales](https://data.ajman.ae/explore/dataset/lands-sales/) | Ajman | catalogued |
| `ajman_lands-transactions` | [Ajman · Land Transactions](https://data.ajman.ae/explore/dataset/lands-transactions/) | Ajman | catalogued |
| `ajman_real-estate-offices` | [Ajman · Real Estate Offices](https://data.ajman.ae/explore/dataset/real-estate-offices/) | Ajman | catalogued |
| `ajman_real-estate-offices-classification` | [Ajman · Office Classification](https://data.ajman.ae/explore/dataset/real-estate-offices-classification/) | Ajman | catalogued |
| `ajman_real-estate-activities-for-each-office` | [Ajman · Office Licensed Activities](https://data.ajman.ae/explore/dataset/real-estate-activities-for-each-office/) | Ajman | catalogued |
| `rak_transactions` | [RAK Property Transaction Reports](https://mun.rak.ae/home/rak-municipality/organizational-structure/lands-properties-sector/) | Ras Al Khaimah | catalogued |
| `rak_statistics` | [RAK Statistics Centre](https://css.rak.ae/en/) | Ras Al Khaimah | catalogued |
| `sharjah_registration` | [Sharjah Real Estate Registration Department](https://www.shjrerd.gov.ae/) | Sharjah | unavailable |
| `uaq_coverage` | [Umm Al Quwain Coverage Gap](https://u.ae/) | Umm Al Quwain | unavailable |
| `fujairah_coverage` | [Fujairah Coverage Gap](https://u.ae/) | Fujairah | unavailable |
| `uaestat` | [UAE.Stat](https://uaestat.fcsc.gov.ae/en) | UAE | catalogued |
| `dubai_statistics` | [Dubai Interactive Statistics](https://www.dsc.gov.ae/en-us/EServices/Pages/interactive-statistics.aspx) | Dubai | catalogued |
| `cbuae_forex_eibor` | [CBUAE FOREX and EIBOR](https://centralbank.ae/en/forex-eibor/) | UAE | catalogued |
| `uae_golden_visa` | [UAE Golden Visa Information](https://u.ae/en/information-and-services/visa-and-emirates-id/residence-visas/golden-visa) | UAE | catalogued |
| `rta` | [RTA Open Data](https://rta.ae/wps/portal/rta/ae/home/open-data) | Dubai | catalogued |
| `rta_stations` | [RTA Metro and Tram Stations](https://www.rta.ae/wps/portal/rta/ae/public-transport/metro-stations-map) | Dubai | catalogued |
| `khda` | [KHDA School Directory and Data](https://web.khda.gov.ae/en/Education-Directory/Schools) | Dubai | permission_required |
| `det` | [Dubai Tourism Reports](https://www.dubaidet.gov.ae/en/research-and-insights) | Dubai | permission_required |
| `osm` | [OpenStreetMap GCC Extract](https://download.geofabrik.de/asia/gcc-states.html) | UAE | catalogued |
| `overture_buildings` | [Overture Buildings](https://docs.overturemaps.org/guides/buildings/) | UAE | catalogued |
| `overture_places` | [Overture Places](https://docs.overturemaps.org/guides/places/) | UAE | catalogued |
| `copernicus` | [Copernicus Earth Observation](https://dataspace.copernicus.eu/explore-data) | UAE | catalogued |
| `hf_sales` | [Dubai Sales Snapshot — Hugging Face](https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions) | Dubai | catalogued |
| `kaggle_rentals` | [UAE Rental Listings Snapshot — Kaggle](https://www.kaggle.com/datasets/azharsaleem/real-estate-goldmine-dubai-uae-rental-market) | UAE | permission_required |
| `oualib` | [Dubai Real Estate Python/ClickHouse Toolkit](https://github.com/oualib/dubai_real_estate) | Dubai | catalogued |
| `tool_scrapy` | [Scrapy](https://github.com/scrapy/scrapy) | UAE | catalogued |
| `tool_crawlee` | [Crawlee](https://github.com/apify/crawlee) | UAE | catalogued |
| `tool_playwright` | [Playwright](https://github.com/microsoft/playwright) | UAE | catalogued |
| `tool_crawl4ai` | [Crawl4AI](https://github.com/unclecode/crawl4ai) | UAE | catalogued |
| `tool_firecrawl` | [Firecrawl](https://github.com/firecrawl/firecrawl) | UAE | catalogued |
| `tool_pdfplumber` | [pdfplumber](https://github.com/jsvine/pdfplumber) | UAE | catalogued |
| `realtyapi_bayut` | [Third-party Bayut API Client](https://github.com/realtyapi/Bayut-Scraper-API-Python) | UAE | permission_required |
| `apify_portals` | [Third-party Bayut / Property Finder Actor](https://apify.com/webdatalabs/bayut-propertyfinder-scraper) | UAE | permission_required |
| `bayut` | [Bayut Property Listings](https://www.bayut.com/) | UAE | permission_required |
| `propertyfinder` | [Property Finder Listings](https://www.propertyfinder.ae/) | UAE | permission_required |
| `propertymonitor` | [Property Monitor Intelligence APIs](https://propertymonitor.com/products-and-services/pm/pm-api) | UAE | paid |
| `reidin` | [REIDIN Data and APIs](https://reidin.com/) | UAE | paid |
| `airdna` | [AirDNA Short-term Rental APIs](https://docs.airdna.co/) | UAE | paid |
| `private_owner_contacts` | [Private Owner / Investor Contact Data](https://dubailand.gov.ae/en/open-data/real-estate-data) | UAE | unavailable |
| `datadubai_launches` | [Dubai Data · Project launches](https://datadubai.ae/projects/launches/) | Dubai | catalogued |
| `datadubai_affordability` | [Dubai Data · Affordability bands](https://datadubai.ae/affordability/) | Dubai | catalogued |
| `datadubai_handover` | [Dubai Data · Declared handover years](https://datadubai.ae/handover/) | Dubai | catalogued |
| `datadubai_methodology` | [Dubai Data · Methodology](https://datadubai.ae/methodology/) | Dubai | catalogued |
| `datadubai_glossary` | [Dubai Data · Property glossary](https://datadubai.ae/glossary/) | Dubai | catalogued |
| `datadubai_sources` | [Dubai Data · Publisher source coverage](https://datadubai.ae/sources/) | Dubai | catalogued |
| `datadubai_roi` | [Dubai Data · Net yield worked example](https://datadubai.ae/roi-calculator/) | Dubai | catalogued |

## Additional retrieval attempt

On 6 November 2026, all nine catalogued Ajman JSON exports were attempted through the available public retrieval route. No export or current API metadata could be obtained, so **zero Ajman records are claimed loaded**. The recorded endpoints and blockers are in `data/ajman-manifest.json`. This does not prove the endpoints are permanently unavailable.

Two complete public DataDubai JSON references were downloaded and saved separately under `data/references/`: service charges (46 community observations, budget year 2026, no explicit cutoff in the JSON) and stock (five completion bands plus totals, cutoff 29 October 2026). Their hashes, schemas, source links and status are in `data/references-manifest.json`. They are **downloaded but not indexed** and do not alter the 12 seed datasets / 9,208 aggregate-row count.

Optional commands: `python3 scripts/ingest.py --manifest-only --ajman-json` validates current seeds and attempts Ajman exports with source metadata; `python3 scripts/ingest.py --manifest-only --references` downloads the reference JSONs. These commands do not change the app's imported-data status automatically.

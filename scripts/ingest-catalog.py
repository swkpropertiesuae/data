#!/usr/bin/env python3
"""Rebuild the explicit source registry. Catalogued does not mean ingested."""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
manifest = json.loads((DATA / 'manifest.json').read_text())
rows = []

def source(id, name, publisher, emirate, category, url, description, *, status='catalogued', access='Public reference; not ingested', license='Check publisher terms before bulk reuse', tags=None, **extra):
    rows.append(dict(id=id, name=name, publisher=publisher, emirate=emirate, category=category, status=status, url=url, description=description, license=license, access=access, dataThrough=None, attribution=publisher, tags=tags or [], **extra))

descriptions = {
 'areas': 'DLD administrative areas: registered sales count, median price, median AED per sqft, annual change and off-plan share. Area labels are not always the same as market community names.',
 'communities': 'Dubai community benchmarks: registered sales, median prices, AED per sqft, annual changes, rents, gross yields, off-plan share and data-quality flags.',
 'community_bedrooms': 'Community and bedroom breakdowns: sales count, median sale price, price per sqft, size, annual rent, rent sample and gross yield.',
 'community_monthly': 'Monthly community price-per-sqft medians, quartiles, median property price and sales sample counts. Time series; not individual sale records.',
 'community_yearly': 'Annual community registered sales counts, median prices, median AED per sqft and total registered value.',
 'developers': 'Developer-company registry summaries: project counts, registered units, construction-related counts, sales, median prices and off-plan shares. No personal contacts.',
 'market_bedrooms': 'Dubai-wide bedroom segments: registered sales count, median price, size, rent samples and gross yield.',
 'market_monthly': 'Dubai monthly price-per-sqft medians, quartiles, median property prices and registered sales counts.',
 'market_yearly': 'Dubai annual registered sales counts, median prices, median AED per sqft and total registered sales value from 2010.',
 'projects': 'Registered projects: project number, developer, status, construction percentage, declared completion date, registration/start dates, units, escrow bank, location where provided, and registered sales medians.',
 'rents_by_community': 'Ejari-derived community contract counts, median annual rents and gross yields for the publisher\'s trailing period.',
 'yields_by_community': 'Community gross rental yields computed within matched property-class/bedroom segments, with tenancy and ready-sale sample sizes. Costs and vacancy are excluded.'
}
for d in manifest['datasets']:
    stem = pathlib.Path(d['file']).stem
    source(d['id'], 'Dubai Data · ' + d['name'], d['publisher'], 'Dubai', 'projects' if stem == 'projects' else 'developers' if stem == 'developers' else 'rentals' if stem.startswith('rents') else 'investment' if stem.startswith('yields') else 'market', d['sourceUrl'], descriptions[stem], status='loaded', access='Local CSV indexed for search', license=d['license'], tags=['DLD', 'DataDubai', stem.replace('_',' '), 'registered', 'aggregate'])
    rows[-1].update(dataThrough=d['dataThrough'], attribution=d['attribution'], localFile=d['file'], rows=d['rows'], fields=d['columns'], downloadUrl=d['downloadUrl'])

DLD = 'https://dubailand.gov.ae/en/open-data/real-estate-data'
for key, title, desc in [
 ('transactions','Transactions','Registered sales, mortgages, gifts and other procedures; date, amount, size, area, property type, registration type and project where disclosed.'),
 ('rents','Rents / Ejari contracts','Tenancy registration, start/end dates, annual and contract amounts, new/renewal version, property type and location fields.'),
 ('projects','Project registry','Project number, developer, status, construction percentage, inspection/completion dates, declared value, escrow and registered unit counts.'),
 ('valuations','Valuations','Registered valuation records and assessment attributes exposed by the official search.'),
 ('land','Land','Land and parcel attributes exposed by the official search. This is not a public owner-contact database.'),
 ('buildings','Buildings','Building register attributes such as building classification, location and registered property information where disclosed.'),
 ('units','Units','Registered unit characteristics where disclosed by the official table; source availability and join keys must be verified.'),
 ('brokers','Broker register','Public professional registration details. Public registration is not consent to marketing and does not provide private buyer leads.'),
 ('developers','Developer register','Public developer-company registration, licence and legal-status details where exposed.')]:
    source('dld_'+key, 'DLD · '+title, 'Dubai Land Department', 'Dubai', 'official', DLD, desc, access='Public table and CSV search; CAPTCHA/date limits can apply', tags=['DLD', key, 'official'])
source('dubai_data_exchange','Government Data Dubai / Dubai Pulse','Digital Dubai / DLD','Dubai','official','https://data.dubai/','Government data catalog and historical DLD datasets. Distinct from the independent datadubai.ae site. Historical endpoints require current access validation.',access='Historical portal referenced by DLD; downloads not verified in this build',tags=['historical','Dubai Pulse','data.dubai','government'])
source('dld_rental_index','DLD Rental Index','Dubai Land Department','Dubai','rentals','https://dubailand.gov.ae/en/eservices/rental-index/','Official rental benchmark and increase lookup. A lookup service, not a downloaded complete rent database.',tags=['rent increase','rental index','RERA'])
source('dld_residential_sales_index','DLD Residential Sales Price Index','Dubai Land Department','Dubai','market','https://dubailand.gov.ae/en/open-data/residential-properties-price-index-rppi','Residential sale price index and published methodology/reports.',tags=['Moasher','price index'])
source('dld_rental_performance','DLD Residential Rental Performance Index','Dubai Land Department','Dubai','rentals','https://dubailand.gov.ae/en/open-data/residential-rental-performance-index/','Published residential rental index; available periods must be checked before treating as current.',tags=['rental index','historical'])
source('dld_api','DLD API Gateway','Dubai Land Department','Dubai','official','https://dubailand.gov.ae/en/eservices/api-gateway-registration?appId=15','Official integration application route including rental-index information. Company eligibility and integration requirements apply.',status='permission_required',access='Application / approval required',tags=['API','Ejari','official'])
source('dld_research','DLD Research and Investor Reports','Dubai Land Department','Dubai','investors','https://dubailand.gov.ae/en/open-data/research/','Annual reviews and research on investor participation, market activity and sector performance. Aggregate investor statistics where published, not named investor contacts.',tags=['investors','nationality','international investment','reports','annual'])
source('dld_golden_visa','DLD Golden Visa Investor Service','Dubai Land Department','Dubai','investors','https://dubailand.gov.ae/en/eservices/request-for-golden-visa-investor/','Official property-investor residency service and eligibility reference. Rules must be checked live; individual eligibility is not inferred from a dataset.',tags=['investors','Golden Visa','residency'])
source('dld_service_charges','DLD / RERA Service Charge Reference','Dubai Land Department / RERA','Dubai','investment','https://dubailand.gov.ae/en/','Official service-charge information and lookup services; no complete service-charge table has been loaded in this build.',tags=['service charges','Mollak','operating costs'])
source('datadubai_service_charges','Dubai Data Service Charges','Dubai Data / Continental Club Property','Dubai','investment','https://datadubai.ae/service-charges/','Published community service-charge medians, ranges and annual changes. Reference page only, not included in the 12 imported CSVs.',tags=['service charges','DataDubai'])
for id, title, url, desc in [
 ('construction','Construction Progress','https://datadubai.ae/construction/','Projects grouped by the completion percentage recorded at the latest DLD inspection. Inspections are irregular; this is not live site progress.'),
 ('stock','Residential Stock and Pipeline','https://datadubai.ae/stock/','Registered project and approved unit counts by completion band. Approved units are not the same as delivered homes.'),
 ('transactions','Latest Registered Sales','https://datadubai.ae/transactions/','Latest registered-sale log with price, size, type, area and project fields. The page is a recent slice, not the complete transaction archive.'),
 ('mortgages','Mortgages and Gifts','https://datadubai.ae/mortgages/','Published mortgage and gift registrations, historical counts and amounts. Mortgage amount is a loan size and does not establish property value or LTV.'),
 ('compare','Community Comparisons','https://datadubai.ae/','Published community comparison tool using market aggregates; source URLs and supported comparisons should be checked before integration.')]:
    source('datadubai_'+id, 'Dubai Data · '+title, 'Dubai Data / Continental Club Property', 'Dubai', 'market', url, desc, tags=['DataDubai',id])
source('datadubai_mcp','Dubai Data Public MCP','Dubai Data / Continental Club Property','Dubai','api','https://datadubai.ae/mcp/','Documented public read-only MCP service for querying the same published market figures.',access='Public MCP documented; runtime connection not yet enabled',tags=['MCP','AI','DataDubai'])
source('adrec_market','ADREC Market Data','Abu Dhabi Real Estate Centre','Abu Dhabi','market','https://adrec.gov.ae/en/market-data','Official sales, leases, price indices, cash/financed sales and recent sales views with export controls.',access='Public dashboard / export; records not imported yet',tags=['ADREC','DARI','sales','leases','Abu Dhabi'])
source('adrec_reports','ADREC Market Reports','Abu Dhabi Real Estate Centre','Abu Dhabi','investors','https://adrec.gov.ae/property_and_index','Market reports, interactive maps and analytics links for Abu Dhabi property activity.',tags=['ADREC','investors','reports','Yas','Saadiyat'])
for key, title, desc in [
 ('real-estate-units-sales','Unit Sales','Published real-estate unit sale statistics by available project/district/type/period dimensions. Do not assume one row means one individual sale.'),
 ('real-estate-units-transactions','Unit Transactions','Published unit transaction statistics, including disposition and mortgage activity.'),
 ('real-estate-units-registration','Unit Registrations','Published counts and values of initial and final unit registrations.'),
 ('real-estate-projects','Development Projects','Registered projects completed or under construction.'),
 ('lands-sales','Land Sales','Published land sale totals by available sector, district and period dimensions.'),
 ('lands-transactions','Land Transactions','Published land transaction totals by available sector, district and period dimensions.'),
 ('real-estate-offices','Real Estate Offices','Public registered real-estate offices.'),
 ('real-estate-offices-classification','Office Classification','Public official classification results for real-estate offices.'),
 ('real-estate-activities-for-each-office','Office Licensed Activities','Activities registered for public real-estate offices.')]:
    source('ajman_'+key, 'Ajman · '+title, 'Ajman Department of Land and Real Estate Regulation', 'Ajman', 'official', 'https://data.ajman.ae/explore/dataset/'+key+'/', desc, access='Dataset export/API; not imported yet', license='Check the current dataset licence; projects metadata states CC BY 4.0', tags=['Ajman', key, 'API'])
source('rak_transactions','RAK Property Transaction Reports','Ras Al Khaimah Municipality','Ras Al Khaimah','market','https://mun.rak.ae/home/rak-municipality/organizational-structure/lands-properties-sector/','Monthly and annual property transaction reports and sales values by area. Statistical reports, not a complete individual-sales feed.',tags=['RAK','Al Marjan','Al Hamra','reports'])
source('rak_statistics','RAK Statistics Centre','Ras Al Khaimah Statistics Centre','Ras Al Khaimah','demographics','https://css.rak.ae/en/','Real-estate, population, tourism and economic statistics useful for demand research.',tags=['RAK','population','tourism','demand'])
source('sharjah_registration','Sharjah Real Estate Registration Department','Sharjah Real Estate Registration Department','Sharjah','official','https://www.shjrerd.gov.ae/','Official property authority and reports reference. Equivalent public bulk sales feed was not verified; website fetch timed out during research.',status='unavailable',access='Official reference; current bulk access unverified',tags=['Sharjah','Masaar','Aljada'])
source('uaq_coverage','Umm Al Quwain Coverage Gap','SWK source registry','Umm Al Quwain','coverage','https://u.ae/','No equivalent official downloadable transaction feed was verified in this build. This entry records a coverage gap, not a dataset.',status='unavailable',access='Source discovery / official request needed',tags=['UAQ','Siniya','coverage gap'])
source('fujairah_coverage','Fujairah Coverage Gap','SWK source registry','Fujairah','coverage','https://u.ae/','No equivalent official downloadable transaction feed was verified in this build. This entry records a coverage gap, not a dataset.',status='unavailable',access='Source discovery / official request needed',tags=['Fujairah','coverage gap'])
source('uaestat','UAE.Stat','Federal Competitiveness and Statistics Centre','UAE','demographics','https://uaestat.fcsc.gov.ae/en','National population, labour, economy and construction indicators for demand and investment context.',tags=['population','labour','construction','UAE'])
source('dubai_statistics','Dubai Interactive Statistics','Dubai Data and Statistics Establishment','Dubai','demographics','https://www.dsc.gov.ae/en-us/EServices/Pages/interactive-statistics.aspx','Housing, buildings, construction, population, employment and other statistical themes.',tags=['population','construction','demand','DDSE'])
source('cbuae_forex_eibor','CBUAE FOREX and EIBOR','Central Bank of the UAE','UAE','investment','https://centralbank.ae/en/forex-eibor/','Official exchange-rate and EIBOR benchmark reference for international investor and mortgage calculations. Current rates have not been imported.',tags=['EIBOR','mortgage','currency','exchange rates'])
source('uae_golden_visa','UAE Golden Visa Information','UAE Government','UAE','investors','https://u.ae/en/information-and-services/visa-and-emirates-id/residence-visas/golden-visa','Official residency information for investor research. Eligibility and rules require current official verification.',tags=['Golden Visa','investor','residency'])
source('rta','RTA Open Data','Dubai Roads and Transport Authority','Dubai','transport','https://rta.ae/wps/portal/rta/ae/home/open-data','Transport datasets and annual reports for mobility and accessibility research.',tags=['metro','tram','bus','transport'])
source('rta_stations','RTA Metro and Tram Stations','Dubai Roads and Transport Authority','Dubai','transport','https://www.rta.ae/wps/portal/rta/ae/public-transport/metro-stations-map','Official metro and tram station maps and locations; reference source not imported into the app.',tags=['metro proximity','tram','stations'])
source('khda','KHDA School Directory and Data','Knowledge and Human Development Authority','Dubai','amenities','https://web.khda.gov.ae/en/Education-Directory/Schools','School location, curriculum, rating and fees for family-property research. KHDA open-data policy states its data is not intended for profit.',status='permission_required',access='Public lookup; clarify commercial reuse with publisher',tags=['schools','fees','ratings','family'])
source('det','Dubai Tourism Reports','Dubai Department of Economy and Tourism','Dubai','tourism','https://www.dubaidet.gov.ae/en/research-and-insights','Tourism and hotel supply/demand reports for short-stay investment context. Report reproduction rights require review.',status='permission_required',access='Public reports; reproduction permission can be required',tags=['tourism','occupancy','ADR','holiday homes'])
source('osm','OpenStreetMap GCC Extract','OpenStreetMap contributors / Geofabrik','UAE','geospatial','https://download.geofabrik.de/asia/gcc-states.html','Downloadable GCC geographic extracts; filter UAE features for neighbourhood maps and amenities. Not a property ownership register.',license='ODbL; comply with attribution and applicable database obligations',tags=['maps','roads','amenities','boundaries'])
source('overture_buildings','Overture Buildings','Overture Maps Foundation','UAE','geospatial','https://docs.overturemaps.org/guides/buildings/','Building footprints and available attributes for maps, spatial analysis and basic 3D display. UAE coverage and field completeness need measurement.',license='Theme/source-specific open licences; inspect attribution guidance',tags=['buildings','footprints','3D','maps'])
source('overture_places','Overture Places','Overture Maps Foundation','UAE','amenities','https://docs.overturemaps.org/guides/places/','Global places such as businesses, schools, hospitals and landmarks. Extract UAE records and measure local completeness before publishing.',license='Theme/source-specific licences; documentation lists CDLA Permissive 2.0 and Apache 2.0',tags=['POI','schools','hospitals','amenities'])
source('copernicus','Copernicus Earth Observation','European Union / Copernicus Data Space Ecosystem','UAE','geospatial','https://dataspace.copernicus.eu/explore-data','Sentinel imagery and Earth-observation data for land-use and construction-area research. Imagery cannot establish individual property condition or flood risk without analysis.',license='Applicable Sentinel data licence / collection conditions',access='Public catalog; registration and collection-specific access may apply',tags=['satellite','land use','construction','environment'])
source('hf_sales','Dubai Sales Snapshot — Hugging Face','Dubai Real Estate Data (independent publisher)','Dubai','transactions','https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions','Publisher documents approximately 1.38 million registered sale rows through 2 November 2026 in CSV and Parquet. Downloadable historical snapshot, not ingested in this build.',license='Publisher states CC BY 4.0',access='Public download; optional --full-sales downloads outside Git',tags=['historical','sales','Parquet','Hugging Face'])
source('kaggle_rentals','UAE Rental Listings Snapshot — Kaggle','Dataset uploader / Bayut-derived snapshot','UAE','listings','https://www.kaggle.com/datasets/azharsaleem/real-estate-goldmine-dubai-uae-rental-market','Historical rental-advertisement snapshot across UAE cities. Asking rents differ from registered rents; verify provenance, date and reuse rights.',status='permission_required',access='Historical research snapshot; commercial rights not established',tags=['Kaggle','Bayut','asking rents','listings'])
source('oualib','Dubai Real Estate Python/ClickHouse Toolkit','oualib / repository contributors','Dubai','tools','https://github.com/oualib/dubai_real_estate','Python ingestion and analysis package describing DLD datasets. Software licence differs from the underlying data licence; connections and freshness need testing.',license='Apache 2.0 software; source data has separate terms',tags=['Python','ClickHouse','DLD','GitHub'])
for id,name,url,desc in [
 ('scrapy','Scrapy','https://github.com/scrapy/scrapy','Python structured web-crawling framework for websites where collection is permitted.'),
 ('crawlee','Crawlee','https://github.com/apify/crawlee','JavaScript/TypeScript crawling queues, browser automation and data extraction.'),
 ('playwright','Playwright','https://github.com/microsoft/playwright','Browser automation for permitted JavaScript-driven pages and interactions.'),
 ('crawl4ai','Crawl4AI','https://github.com/unclecode/crawl4ai','Website-to-Markdown and structured extraction for AI knowledge pipelines; self-hosted and hosted options.'),
 ('firecrawl','Firecrawl','https://github.com/firecrawl/firecrawl','Website crawling/extraction platform; self-hosted source has AGPL licence conditions and cloud access has separate terms.'),
 ('pdfplumber','pdfplumber','https://github.com/jsvine/pdfplumber','Extract text and tables from machine-readable PDFs such as authorised brochures and price lists. Scans require OCR separately.')]:
    source('tool_'+id,name,'Project maintainers','UAE','tools',url,desc,access='Software available; not an operational collection job',license='See repository licence; no licence to source website content is granted',tags=['tools','scraping','extraction',id])
source('realtyapi_bayut','Third-party Bayut API Client','RealtyAPI','UAE','tools','https://github.com/realtyapi/Bayut-Scraper-API-Python','Python client for a third-party extraction API. Requires provider key. It is not an official Bayut open API or proof of permission to reuse portal data.',status='permission_required',access='Provider account/key plus applicable source permission',tags=['Bayut','third-party API','scraper'])
source('apify_portals','Third-party Bayut / Property Finder Actor','WebDataLabs / Apify community','UAE','tools','https://apify.com/webdatalabs/bayut-propertyfinder-scraper','Hosted actor advertises listing extraction. Reliability and commercial reuse rights have not been established; no actor has been run.',status='permission_required',access='Third-party paid service; source permission still needed',tags=['Apify','Bayut','Property Finder','scraper'])
source('bayut','Bayut Property Listings','Bayut','UAE','listings','https://www.bayut.com/','Public property advertisements and market tools. Published terms restrict scraping and commercial content reuse; no portal inventory imported.',status='permission_required',access='Authorised feed or agreement needed for SWK commercial imports',tags=['Bayut','listings','asking prices','rent'])
source('propertyfinder','Property Finder Listings','Property Finder','UAE','listings','https://www.propertyfinder.ae/','Public property advertisements. Published terms restrict automated collection, property database creation and commercial content reuse.',status='permission_required',access='Authorised feed or agreement needed for SWK commercial imports',tags=['Property Finder','listings','asking prices'])
source('propertymonitor','Property Monitor Intelligence APIs','Property Monitor','UAE','commercial','https://propertymonitor.com/products-and-services/pm/pm-api','Comparable transactions, market statistics, indices, address matching, POIs and automated valuation APIs.',status='paid',access='Provider agreement, credentials and pricing',tags=['API','AVM','comparables','valuation'])
source('reidin','REIDIN Data and APIs','REIDIN','UAE','commercial','https://reidin.com/','Proprietary real-estate analytics, transactions, asking prices, trends, occupancy, supply metrics and APIs.',status='paid',access='Provider agreement, credentials and pricing',tags=['REIDIN','API','occupancy','service charges'])
source('airdna','AirDNA Short-term Rental APIs','AirDNA','UAE','commercial','https://docs.airdna.co/','Short-stay market research, occupancy, nightly rates, revenue estimates and comparable properties. Confirm the contracted coverage for UAE locations.',status='paid',access='Enterprise/provider access and market coverage agreement',tags=['holiday homes','short-term rentals','Airbnb','occupancy'])
source('private_owner_contacts','Private Owner / Investor Contact Data','Not a public dataset','UAE','coverage','https://dubailand.gov.ae/en/open-data/real-estate-data','Public market datasets do not provide an unrestricted owner, buyer or tenant phone/email directory. Leaked registries and unauthorised personal contact lists are excluded.',status='unavailable',access='Not offered by this service',tags=['owner phones','investor contacts','privacy'])

# Only public publisher feeds belong in this public registry.
feeds_path = DATA / 'datadubai-public-feeds.json'
if feeds_path.exists():
    for feed in json.loads(feeds_path.read_text()):
        row = next((r for r in rows if r['url'] == feed['page']), None)
        if row is None:
            source('datadubai_' + feed['id'], 'Dubai Data · ' + feed['name'], 'Dubai Data / Continental Club Property', 'Dubai', 'reference', feed['page'], 'Public ' + feed['name'].lower() + ' JSON feed with publisher provenance and dates.')
            row = rows[-1]
        row.update(name='Dubai Data · ' + feed['name'], directFeed=feed['id'], access='Connected on demand in production; six-hour cache; not an imported dataset', license='CC BY 4.0; attribution and source link required', tags=['Dubai Data', 'JSON', feed['id']])

# Preserve explicit download provenance without converting it to loaded status.
ref_path = DATA / 'references-manifest.json'
if ref_path.exists():
    refs = {item['id']: item for item in json.loads(ref_path.read_text()).get('sources', [])}
    for row in rows:
        if row['id'] in refs:
            item = refs[row['id']]
            row.update(referenceFile=item['file'], referenceStatus=item['status'], referenceDataThrough=item.get('dataThrough'))
ajman_path = DATA / 'ajman-manifest.json'
if ajman_path.exists():
    attempts = json.loads(ajman_path.read_text())
    for row in rows:
        if row['id'].startswith('ajman_'):
            row.update(lastRetrievalAttempt=attempts.get('attemptedAt'), retrievalResult='see_ajman_manifest')

(DATA / 'catalog.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'sources':len(rows),'loaded':sum(r['status']=='loaded' for r in rows),'records':manifest['totalRecords']}))

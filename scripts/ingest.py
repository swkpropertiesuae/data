#!/usr/bin/env python3
"""Refresh explicitly allowlisted public data; preserve last known-good files on failure.

Examples:
  python3 scripts/ingest.py                  # all 12 DataDubai aggregate CSVs
  python3 scripts/ingest.py --ajman          # aggregate Ajman datasets as well
  python3 scripts/ingest.py --full-sales     # download large historical sales snapshot outside Git

No login bypass, no contact harvesting, no portal listing scraping.
"""
import argparse, csv, hashlib, io, json, os, pathlib, tempfile, urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
DATASETS = ['areas', 'communities', 'community_bedrooms', 'community_monthly', 'community_yearly', 'developers', 'market_bedrooms', 'market_monthly', 'market_yearly', 'projects', 'rents_by_community', 'yields_by_community']
AJMAN = ['real-estate-units-sales', 'real-estate-units-transactions', 'real-estate-units-registration', 'lands-sales', 'lands-transactions', 'real-estate-projects']
USER_AGENT = 'SWKData/1.0 (+https://data.swk.rent; public open-data import)'
ATTRIBUTION = 'Dubai Data (datadubai.ae), Continental Club Property — based on Dubai Land Department open data.'

def download(url, max_bytes=64 * 1024 * 1024):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/csv, text/plain;q=0.9'})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError('Source exceeded configured download limit')
        if data.lstrip().startswith((b'<html', b'<!DOCTYPE', b'<!doctype')):
            raise ValueError('Expected CSV, received HTML; previous file was preserved')
        return data

def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        f.write(content); temporary = f.name
    os.replace(temporary, path)

def inspect_csv(content):
    text = content.decode('utf-8-sig')
    # DataDubai uses commas; Ajman CSV export explicitly requests a comma.
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or len(reader.fieldnames) < 2:
        raise ValueError('CSV schema has fewer than two fields')
    rows = list(reader)
    if not rows:
        raise ValueError('Empty response; previous data was preserved')
    if any(None in row for row in rows):
        raise ValueError('Malformed CSV row; previous data was preserved')
    return reader.fieldnames, len(rows)

def build_manifest(data_through=None, source_commit=None):
    old_path = DATA / 'manifest.json'
    previous = json.loads(old_path.read_text()) if old_path.exists() else {}
    cutoff = data_through or previous.get('dataThrough', '2026-10-29')
    datasets = []
    for filename in DATASETS:
        path = DATA / 'seed' / (filename + '.csv')
        if not path.exists(): continue
        content = path.read_bytes()
        fields, rows = inspect_csv(content)
        datasets.append({'id': 'datadubai_' + filename, 'name': filename.replace('_', ' ').title(), 'file': 'data/seed/' + path.name, 'rows': rows, 'columns': fields, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest(), 'sourceUrl': 'https://github.com/datadubai/dubai-real-estate-dld/blob/main/data/' + path.name, 'downloadUrl': 'https://raw.githubusercontent.com/datadubai/dubai-real-estate-dld/main/data/' + path.name, 'publisher': 'Dubai Data / Continental Club Property', 'upstreamPublisher': 'Dubai Land Department', 'license': 'CC BY 4.0', 'dataThrough': cutoff, 'attribution': ATTRIBUTION})
    result = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'dataThrough': cutoff, 'sourceCommit': source_commit or (previous.get('sourceCommit') if cutoff == previous.get('dataThrough') else None), 'sourceRepository': 'https://github.com/datadubai/dubai-real-estate-dld', 'datasets': datasets, 'totalRecords': sum(d['rows'] for d in datasets), 'datasetCount': len(datasets), 'notes': ['Rows are aggregate observations, not unique properties or people.', 'The same underlying transactions can contribute to multiple aggregate tables; do not sum table row counts as sales counts.', 'Source dates describe the imported snapshot and do not mean live availability.', 'Gross rental yields exclude service charges, vacancy and transaction costs.', 'Seed text line endings normalized to LF; numeric values and field names retained.']}
    atomic_write(old_path, (json.dumps(result, ensure_ascii=False, indent=2) + '\n').encode())
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ajman', action='store_true')
    parser.add_argument('--full-sales', action='store_true')
    parser.add_argument('--ajman-json', action='store_true', help='Download the nine public Ajman exports plus metadata; keep separate manifest')
    parser.add_argument('--references', action='store_true', help='Download service-charge/stock reference JSON without claiming indexed status')
    parser.add_argument('--manifest-only', action='store_true')
    args = parser.parse_args()
    errors = []
    cutoff = None
    source_commit = None
    if not args.manifest_only:
        # Read publisher cutoff without fabricating the import date as the data date.
        try:
            ref = json.loads(download('https://api.github.com/repos/datadubai/dubai-real-estate-dld/git/ref/heads/main'))
            source_commit = ref['object']['sha']
            readme = download('https://raw.githubusercontent.com/datadubai/dubai-real-estate-dld/' + source_commit + '/README.md').decode()
            import re
            match = re.search(r'Data through:\*\*\s*(\d{4}-\d{2}-\d{2})', readme)
            if match: cutoff = match.group(1)
        except Exception as exc: errors.append({'source': 'publisher_metadata', 'error': str(exc)})
        for name in DATASETS:
            try:
                content = download('https://raw.githubusercontent.com/datadubai/dubai-real-estate-dld/' + (source_commit or 'main') + '/data/' + name + '.csv')
                fields, count = inspect_csv(content)
                atomic_write(DATA / 'seed' / (name + '.csv'), content.replace(b'\r\n', b'\n'))
                print(json.dumps({'source': name, 'rows': count, 'status': 'loaded'}))
            except Exception as exc: errors.append({'source': name, 'error': str(exc)})
    if args.ajman:
        for name in AJMAN:
            try:
                url = 'https://data.ajman.ae/api/explore/v2.1/catalog/datasets/' + name + '/exports/csv?lang=en&timezone=Asia%2FDubai&use_labels=false&delimiter=%2C'
                content = download(url)
                fields, count = inspect_csv(content)
                atomic_write(DATA / 'extra' / 'ajman' / (name + '.csv'), content)
                # Ajman exports are supplementary files until explicitly indexed by the app.
                print(json.dumps({'source': name, 'rows': count, 'status': 'downloaded_not_indexed', 'url': url}))
            except Exception as exc: errors.append({'source': name, 'error': str(exc)})
    if args.ajman_json:
        entries = []
        nine = AJMAN + ['real-estate-offices', 'real-estate-offices-classification', 'real-estate-activities-for-each-office']
        for name in nine:
            base = 'https://data.ajman.ae/api/explore/v2.1/catalog/datasets/' + name
            entry = {'id': 'ajman_' + name, 'datasetId': name, 'emirate': 'Ajman', 'exportUrl': base + '/exports/json', 'metadataUrl': base, 'status': 'catalogued'}
            try:
                metadata = json.loads(download(base))
                records = json.loads(download(base + '/exports/json'))
                if not isinstance(records, list) or not records or not all(isinstance(row, dict) for row in records):
                    raise ValueError('Expected a nonempty JSON array of objects')
                default_meta = metadata.get('metas', {}).get('default', {})
                licence = default_meta.get('license')
                if not licence:
                    raise ValueError('Metadata does not declare a licence; verify reuse before downloading to the public repository')
                relative = 'data/seed/ajman_' + name.replace('-', '_') + '.json'
                content = (json.dumps(records, ensure_ascii=False, indent=2) + '\n').encode()
                atomic_write(ROOT / relative, content)
                entry.update(status='downloaded_not_indexed', file=relative, rows=len(records), fields=sorted(set().union(*(row.keys() for row in records))), license=licence, metadata=default_meta, sha256=hashlib.sha256(content).hexdigest())
            except Exception as exc:
                entry['error'] = str(exc)
                errors.append({'source': name, 'error': str(exc)})
            entries.append(entry)
        atomic_write(DATA / 'ajman-manifest.json', (json.dumps({'attemptedAt': datetime.now(timezone.utc).isoformat(), 'loadedDatasets': 0, 'loadedRecords': 0, 'sources': entries}, ensure_ascii=False, indent=2) + '\n').encode())
    if args.references:
        refs = []
        for name in ['service-charges', 'stock']:
            url = 'https://datadubai.ae/' + name + '.json'
            try:
                payload = json.loads(download(url))
                if not isinstance(payload, dict): raise ValueError('Expected JSON object')
                collection = payload.get('communities', payload.get('bands'))
                if not isinstance(collection, list): raise ValueError('Expected communities or bands array')
                file = 'data/references/datadubai_' + name.replace('-', '_') + '.json'
                content = (json.dumps(payload, ensure_ascii=False, indent=2) + '\n').encode()
                atomic_write(ROOT / file, content)
                refs.append({'id':'datadubai_'+name.replace('-','_'), 'sourceUrl':url,'file':file,'status':'downloaded_not_indexed','dataThrough':payload.get('through'),'budgetYear':payload.get('year'),'records':len(collection),'fields':list(payload),'sha256':hashlib.sha256(content).hexdigest(),'attribution':ATTRIBUTION})
            except Exception as exc: errors.append({'source': name, 'error': str(exc)})
        if refs: atomic_write(DATA / 'references-manifest.json', (json.dumps({'retrievedAt':datetime.now(timezone.utc).isoformat(),'sources':refs},ensure_ascii=False,indent=2)+'\n').encode())
    if args.full_sales:
        url = 'https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions/resolve/main/dld_sales_transactions.parquet?download=true'
        try:
            content = download(url, max_bytes=512 * 1024 * 1024)
            if not (content[:4] == b'PAR1' and content[-4:] == b'PAR1'): raise ValueError('Response is not Parquet')
            atomic_write(DATA / 'raw' / 'dld_sales_transactions.parquet', content)
            print(json.dumps({'source': 'dld_sales_snapshot', 'bytes': len(content), 'status': 'downloaded_not_indexed', 'url': url}))
        except Exception as exc: errors.append({'source': 'dld_sales_snapshot', 'error': str(exc)})
    manifest = build_manifest(cutoff, source_commit)
    atomic_write(DATA / 'ingestion-report.json', (json.dumps({'at': datetime.now(timezone.utc).isoformat(), 'errors': errors, 'recordsAvailable': manifest['totalRecords']}, indent=2) + '\n').encode())
    print(json.dumps({'datasets': manifest['datasetCount'], 'records': manifest['totalRecords'], 'errors': errors}))
    if errors: raise SystemExit(1)

if __name__ == '__main__': main()

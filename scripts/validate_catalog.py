#!/usr/bin/env python3
import glob, html, json, os, re, sys, time
from urllib.parse import urlparse, urljoin

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36 OLFYNE-Catalog-Health/1.0'
SESSION = requests.Session()
SESSION.headers.update({'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7'})
TIMEOUT = 16


def load_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write('\n')


def key(item):
    return f"{item.get('name','')}|{item.get('brand','')}"


def merge_catalog():
    perfumes = load_json(os.path.join(DATA, 'perfumes.json'), [])
    replacements = load_json(os.path.join(DATA, 'replacements.json'), {})
    meta = load_json(os.path.join(DATA, 'catalog-meta.json'), {})
    link_sets = []
    for path in sorted(glob.glob(os.path.join(DATA, 'official-links*.json'))):
        link_sets.append(load_json(path, {}))

    merged = []
    for perfume in perfumes:
        original_key = key(perfume)
        base = dict(perfume)
        if original_key in replacements:
            base.update(replacements[original_key])
        active_key = key(base)
        item = dict(base)
        item.update(meta.get(active_key, meta.get(original_key, {})))
        for links in link_sets:
            item.update(links.get(active_key, links.get(original_key, {})))
        item['_original_key'] = original_key
        item['_active_key'] = active_key
        merged.append(item)
    return merged, meta


def get(url, stream=False):
    try:
        return SESSION.get(url, timeout=TIMEOUT, allow_redirects=True, stream=stream)
    except requests.RequestException:
        return None


def is_definitely_dead(resp):
    return resp is not None and resp.status_code in (404, 410)


def is_accessible(resp):
    if resp is None:
        return False
    return 200 <= resp.status_code < 400 or resp.status_code in (401, 403, 429)


def looks_direct_product_url(url):
    if not url:
        return False
    p = urlparse(url)
    path = p.path.strip('/')
    if not path:
        return False
    parts = [x for x in path.split('/') if x]
    generic = {'fr', 'fr-fr', 'eu-fr', 'en-eu', 'products', 'product', 'parfums', 'perfume', 'fragrance', 'collections', 'all'}
    meaningful = [x for x in parts if x.lower() not in generic]
    return len(meaningful) >= 1 and (len(parts) >= 2 or any(c.isdigit() for c in path) or '-' in path)


def extract_og_image(text, base_url):
    if not text:
        return None
    patterns = [
        r'<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image(?::secure_url)?["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']'
    ]
    for pattern in patterns:
        m = re.search(pattern, text, flags=re.I)
        if m:
            return urljoin(base_url, html.unescape(m.group(1).strip()))
    return None


def validate_image(url):
    if not url:
        return False, None
    resp = get(url, stream=True)
    if resp is None:
        return False, None
    ctype = (resp.headers.get('content-type') or '').lower()
    ok = (200 <= resp.status_code < 400 and ('image/' in ctype or not ctype)) or resp.status_code in (401, 403, 429)
    final = resp.url if resp.url else url
    resp.close()
    return ok, final


def main():
    catalog, meta = merge_catalog()
    disabled = {}
    report = {'checked_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'total': len(catalog), 'active': 0, 'disabled': 0, 'warnings': [], 'items': {}}

    for idx, item in enumerate(catalog, 1):
        k = item['_active_key']
        url = item.get('official_url')
        state = {'official_url': url, 'url_status': None, 'image_status': None}
        reason = None

        if not url:
            reason = 'missing_official_url'
        elif not looks_direct_product_url(url):
            reason = 'non_direct_official_url'
        else:
            resp = get(url)
            if resp is None:
                state['url_status'] = 'unreachable'
                report['warnings'].append({'key': k, 'type': 'url_unreachable', 'url': url})
            else:
                state['url_status'] = resp.status_code
                state['final_url'] = resp.url
                if is_definitely_dead(resp):
                    reason = f'official_url_{resp.status_code}'
                elif not is_accessible(resp) and resp.status_code >= 400:
                    report['warnings'].append({'key': k, 'type': f'url_http_{resp.status_code}', 'url': url})

                # Enrich missing/broken photo from official product page metadata.
                image_url = item.get('image_url')
                image_ok, image_final = validate_image(image_url) if image_url else (False, None)
                if image_ok:
                    state['image_status'] = 'ok'
                    if image_final and image_final != image_url:
                        meta.setdefault(k, {})['image_url'] = image_final
                else:
                    og = extract_og_image(resp.text if hasattr(resp, 'text') else '', resp.url)
                    og_ok, og_final = validate_image(og) if og else (False, None)
                    if og_ok:
                        meta.setdefault(k, {})['image_url'] = og_final or og
                        state['image_status'] = 'repaired_from_official_page'
                    else:
                        state['image_status'] = 'missing_or_broken'
                        if reason is None:
                            reason = 'missing_or_broken_product_image'

        if reason:
            disabled[k] = {'reason': reason, 'official_url': url}
            state['active'] = False
            state['reason'] = reason
            report['disabled'] += 1
        else:
            state['active'] = True
            report['active'] += 1

        report['items'][k] = state
        print(f'[{idx}/{len(catalog)}] {k}: {"DISABLED " + reason if reason else "OK"}', flush=True)

    save_json(os.path.join(DATA, 'catalog-meta.json'), meta)
    save_json(os.path.join(DATA, 'disabled-items.json'), disabled)
    save_json(os.path.join(DATA, 'catalog-health.json'), report)
    print(f"Checked {report['total']} — active {report['active']} — disabled {report['disabled']}")


if __name__ == '__main__':
    main()

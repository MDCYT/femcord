import json
import os
import sys

def main():
    input_file = r'C:\Users\Personal\Downloads\jsonformatter.txt'
    repo_assets = r'C:\Users\Personal\FemCord\assets'
    collectibles_file = os.path.join(repo_assets, 'collectibles.json')
    effects_file = os.path.join(repo_assets, 'profile-effects.json')

    print(f"Reading {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        new_categories = json.load(f)

    old_categories = []
    if os.path.exists(collectibles_file):
        try:
            with open(collectibles_file, 'r', encoding='utf-8') as f:
                old_categories = json.load(f)
        except Exception as e:
            print(f"Warning: could not read old collectibles: {e}")

    old_effects = []
    if os.path.exists(effects_file):
        try:
            with open(effects_file, 'r', encoding='utf-8') as f:
                old_effects = json.load(f)
        except Exception as e:
            print(f"Warning: could not read old effects: {e}")

    pe_dict = {}
    for item in old_effects:
        sku = item.get('sku_id') or item.get('id')
        if sku:
            pe_dict[sku] = item

    def normalize_product(prod):
        prod['unpublished_at'] = None
        if not prod.get('store_listing_id'):
            prod['store_listing_id'] = prod['sku_id']
        prod['premium_type'] = 2
        prod['hide_badge'] = True

        # Normalize prices to 0
        norm_prices = {}
        for group, val in (prod.get('prices') or {}).items():
            cp = (val.get('country_prices') or val.get('countryPrices')) if isinstance(val, dict) else None
            raw_p = cp.get('prices') if isinstance(cp, dict) else None
            if isinstance(raw_p, list):
                p_list = [{'amount': 0, 'currency': p.get('currency', 'usd'), 'exponent': p.get('exponent', 2)} for p in raw_p]
            else:
                p_list = [{'amount': 0, 'currency': 'usd', 'exponent': 2}]
            cc = (cp.get('country_code') or cp.get('countryCode') or 'US') if isinstance(cp, dict) else 'US'
            norm_prices[group] = {'country_prices': {'country_code': cc, 'prices': p_list}}
        if not norm_prices:
            norm_prices['0'] = {'country_prices': {'country_code': 'US', 'prices': [{'amount': 0, 'currency': 'usd', 'exponent': 2}]}}
        prod['prices'] = norm_prices

        # Extract profile effects & ensure id
        for item in prod.get('items') or []:
            if item.get('type') == 1:
                item.setdefault('id', item['sku_id'])
                if item.get('effects'):
                    pe_dict[item['sku_id']] = {
                        'type': 1,
                        'id': item['sku_id'],
                        'sku_id': item['sku_id'],
                        'title': item.get('title') or item.get('label', ''),
                        'description': item.get('description', ''),
                        'accessibilityLabel': item.get('accessibilityLabel') or item.get('label', ''),
                        'animationType': item.get('animationType', 1),
                        'thumbnailPreviewSrc': item.get('thumbnailPreviewSrc'),
                        'reducedMotionSrc': item.get('reducedMotionSrc'),
                        'effects': item.get('effects', [])
                    }
        for sub in prod.get('bundled_products') or []:
            normalize_product(sub)
        for var in prod.get('variants') or []:
            normalize_product(var)

    categories_by_sku = {}
    for cat in new_categories:
        cat['unpublished_at'] = None
        if isinstance(cat.get('assets'), dict):
            urls = cat['assets'].get('url') or {}
            if isinstance(urls, dict):
                cat.setdefault('hero_banner_url', urls.get('hero_banner'))
                cat.setdefault('catalog_banner_url', urls.get('catalog_banner'))
                cat.setdefault('featured_block_url', urls.get('featured_block'))
                cat.setdefault('logo_url', urls.get('logo'))
                cat.setdefault('hero_logo_url', urls.get('hero_logo'))
                cat.setdefault('mobile_hero_url', urls.get('mobile_hero'))
                cat.setdefault('mobile_banner_url', urls.get('mobile_banner'))
                cat.setdefault('mobile_bg_url', urls.get('mobile_bg'))
                cat.setdefault('pdp_bg_url', urls.get('pdp_bg'))
            cfg = cat['assets'].get('json') or {}
            if isinstance(cfg, dict):
                cat.setdefault('hero_banner_display_config', cfg.get('hero_banner_display_config'))

        for prod in cat.get('products') or []:
            normalize_product(prod)

        categories_by_sku[cat['sku_id']] = cat

    # Preserve any category from existing collectibles not present in new
    for cat in old_categories:
        if cat['sku_id'] not in categories_by_sku:
            cat['unpublished_at'] = None
            for prod in cat.get('products') or []:
                normalize_product(prod)
            categories_by_sku[cat['sku_id']] = cat

    final_categories = list(categories_by_sku.values())
    final_categories.sort(key=lambda x: int(x['sku_id']), reverse=True)

    final_effects = list(pe_dict.values())
    final_effects.sort(key=lambda x: int(x.get('sku_id', x.get('id', 0))), reverse=True)

    print(f"Writing {len(final_categories)} categories to {collectibles_file}...")
    with open(collectibles_file, 'w', encoding='utf-8') as f:
        json.dump(final_categories, f, indent=2, ensure_ascii=False)

    print(f"Writing {len(final_effects)} profile effects to {effects_file}...")
    with open(effects_file, 'w', encoding='utf-8') as f:
        json.dump(final_effects, f, indent=2, ensure_ascii=False)

    print("Collectibles import complete!")

if __name__ == '__main__':
    main()

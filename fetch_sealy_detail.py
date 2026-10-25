import urllib.request, re, json, os, time
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36', 'Referer': 'https://www.sealy.cn/'}
B = 'https://www.sealy.cn'


def get(u, t=30):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read()


def gett(u, t=30):
    return get(u).decode('utf-8', 'ignore')


black = set(re.findall(r'<img[^>]*src="(/home/web/uploads/[^"]+)"', gett(B + '/category_283.html')))
black |= set(re.findall(r'<img[^>]*src="(/home/web/uploads/[^"]+)"', gett(B + '/china.html')))
print('blacklist', len(black), flush=True)

prods = json.load(open('/tmp/sealy_products.json'))
root = 'assets/sealy/产品'
rec, failed = [], []
for idx, p in enumerate(prods, 1):
    hall = p['hall']
    name = re.sub(r'[/\s]+', '_', p['name']).replace('（', '(').replace('）', ')')
    d = os.path.join(root, hall)
    os.makedirs(d, exist_ok=True)
    if os.path.exists(os.path.join(d, f'{name}_01.jpg')) or os.path.exists(os.path.join(d, f'{name}_01.png')):
        continue
    try:
        s = gett(B + p['url'])
    except Exception as e:
        failed.append((p['name'], 'page', str(e)))
        continue
    imgs = [m for m in dict.fromkeys(re.findall(r'<img[^>]*src="(/home/web/uploads/[^"]+)"', s)) if m not in black and m != p['img']]
    if not imgs:
        failed.append((p['name'], 'noimg', ''))
        continue
    got = 0
    for i, u in enumerate(imgs[:3], 1):
        ext = os.path.splitext(u)[1]
        fp = os.path.join(d, f'{name}_{i:02d}{ext}')
        try:
            data = get(B + u)
            if len(data) > 4_000_000 or len(data) < 1500:
                continue
            open(fp, 'wb').write(data)
            got += 1
            rec.append({'file': fp, 'name': p['name'], 'hall': hall, 'kind': '详情图', 'img_url': B + u, 'page_url': B + p['url'], 'size': len(data)})
        except Exception:
            pass
        time.sleep(.1)
    if got == 0:
        failed.append((p['name'], 'nodl', ''))
    if idx % 10 == 0:
        print('progress', idx, 'files', len(rec), flush=True)

json.dump(rec, open('assets/sealy/manifest_detail.json', 'w'), ensure_ascii=False, indent=1)
json.dump(failed, open('assets/sealy/failed_detail.json', 'w'), ensure_ascii=False, indent=1)
print('DONE detail images:', len(rec), 'failed:', len(failed), flush=True)

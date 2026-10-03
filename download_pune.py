import os
import urllib.request
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
ctx.set_ciphers('DEFAULT@SECLEVEL=1')

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

pdf_targets = [
    ('CR_PUNE_LNL_PUNE_PTT.pdf', 'https://cr.indianrailways.gov.in/cris//uploads/files/1781160194413-PTT%20LNL-PUNE.pdf'),
    ('CR_PUNE_PUNE_LNL_PTT.pdf', 'https://cr.indianrailways.gov.in/cris//uploads/files/1781160272318-PTT%20PUNE-LNL.pdf'),
]

out_dir = '1- Official Time Tabel Data Storage'
os.makedirs(out_dir, exist_ok=True)

for fname, url in pdf_targets:
    target_path = os.path.join(out_dir, fname)
    if os.path.exists(target_path) and os.path.getsize(target_path) > 1000:
        print(f"Skipping {fname}, already exists ({os.path.getsize(target_path)} bytes)")
        continue
    print(f"Downloading {fname} from {url}...")
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            content = resp.read()
            with open(target_path, 'wb') as f:
                f.write(content)
            print(f"  -> Saved {fname} ({len(content)} bytes)")
    except Exception as e:
        print(f"  -> Error downloading {fname}: {e}")

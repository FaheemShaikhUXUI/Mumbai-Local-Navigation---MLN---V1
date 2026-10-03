import os
import urllib.request
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
try:
    ctx.set_ciphers('DEFAULT@SECLEVEL=1')
except Exception:
    pass

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

pdf_targets = [
    # Western Railway
    ('WR_DN_TRAINS_PTT_79.pdf', 'https://wr.indianrailways.gov.in/cris//uploads/files/1788159627721-DN%20TRAINS%20PTT%2079%20W.E.F.%2001.09.2026.pdf'),
    ('WR_UP_TRAINS_PTT_79.pdf', 'https://wr.indianrailways.gov.in/cris//uploads/files/1788159720525-UP%20TRAINS%20PTT%2079%20W.E.F.%2001.09.2026.pdf'),
    ('WR_DN_AC_TRAINS_PTT_79.pdf', 'https://wr.indianrailways.gov.in/cris//uploads/files/1788159762760-DN%20AC%20TRAINS%20PTT%2079%20W.E.F.%2001.09.2026.pdf'),
    ('WR_UP_AC_TRAINS_PTT_79.pdf', 'https://wr.indianrailways.gov.in/cris//uploads/files/1788159808195-UP%20AC%20TRAINS%20PTT%2079%20W.E.F.%2001.09.2026.pdf'),
    ('WR_DAHANU_ROAD_SERVICES_PTT.pdf', 'https://wr.indianrailways.gov.in/cris//uploads/files/1788159851897-DAHANU%20ROAD%20SERVICES%20PTT%20W.E.F.%2001.09.2026.pdf'),
    ('WR_HARBOUR_SERVICES_PTT.pdf', 'https://wr.indianrailways.gov.in/cris//uploads/files/1680671789509-HARBOUR%20SERVICES%20W.E.F%20%20%2001.10.2022.pdf'),
    # Central Railway
    ('CR_MAIN_DN_PTT.pdf', "https://cr.indianrailways.gov.in/cris//uploads/files/1728294831372-SUB%20PTT%20DN%20ML'24.pdf"),
    ('CR_MAIN_UP_PTT.pdf', "https://cr.indianrailways.gov.in/cris//uploads/files/1728294891897-SUB%20PTT%20UP%20ML'24.pdf"),
    ('CR_HARBOUR_DN_PTT.pdf', 'https://cr.indianrailways.gov.in/cris//uploads/files/1777550323377-DN%20HB%20REVISED%20PTT%20WEF%2001.05.2026.pdf'),
    ('CR_HARBOUR_UP_PTT.pdf', 'https://cr.indianrailways.gov.in/cris//uploads/files/1777550366723-UP%20HB%20REVISED%20PTT%20WEF%2001.05.2026.pdf'),
    ('CR_TRANS_HARBOUR_PTT.pdf', 'https://cr.indianrailways.gov.in/cris//uploads/files/1781174782507-THB%20PTT%20wef%20%20%2013.01.2024.pdf'),
    ('CR_PORT_URAN_LINE_PTT.pdf', 'https://cr.indianrailways.gov.in/cris//uploads/files/1781160975368-PORT%20LINE%20PTT%20WEF%2015.12.2025.pdf')
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

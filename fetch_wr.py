import urllib.request
import ssl
import re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
try:
    ctx.set_ciphers('DEFAULT@SECLEVEL=1')
except Exception as e:
    print('cipher warning:', e)

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}
url = 'https://wr.indianrailways.gov.in/view_section.jsp?fontColor=black&backgroundColor=LIGHTSTEELBLUE&lang=0&id=0,6,458'
req = urllib.request.Request(url, headers=headers)

try:
    with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        print(f"Fetched {len(html)} bytes successfully.")
        
        # Save raw html for reference
        with open('scratch_wr_page.html', 'w', encoding='utf-8') as f:
            f.write(html)
            
        links = re.findall(r'<a\s+[^>]*?href=[\'"](.*?)[\'"][^>]*>(.*?)</a>', html, re.I | re.S)
        print(f"Found {len(links)} links:")
        for href, text in links:
            t = re.sub(r'<[^>]+>', '', text).strip()
            if any(k in t.lower() or k in href.lower() for k in ['time', 'pocket', 'table', 'emu', 'harbour', 'central', 'pdf', 'ptt']):
                print(f"  [{t}] -> {href}")
except Exception as e:
    print("Error:", e)

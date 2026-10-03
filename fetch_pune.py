import urllib.request, ssl, re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
ctx.set_ciphers('DEFAULT@SECLEVEL=1')
headers = {'User-Agent': 'Mozilla/5.0'}
url = 'https://cr.indianrailways.gov.in/view_section.jsp?fontColor=black&backgroundColor=LIGHTSTEELBLUE&lang=0&id=0,5,2361'
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        with open('scratch_pune_page.html', 'w', encoding='utf-8') as f:
            f.write(html)
        links = re.findall(r'<a\s+[^>]*?href=[\'"](.*?)[\'"][^>]*>(.*?)</a>', html, re.I | re.S)
        print("Pune Page Links:")
        for href, text in links:
            t = re.sub(r'<[^>]+>', '', text).strip()
            if any(k in t.lower() or k in href.lower() for k in ['time', 'pocket', 'table', 'emu', 'pdf', 'pune', 'lonavala', 'daund']):
                print(f"  [{t}] -> {href}")
except Exception as e:
    print("Error:", e)

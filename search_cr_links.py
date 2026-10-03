import re

with open('scratch_cr_page.html', encoding='utf-8') as f:
    text = f.read()

links = re.findall(r'<a\s+[^>]*?href=[\'"](.*?)[\'"][^>]*>(.*?)</a>', text, re.I | re.S)
for href, t in links:
    clean = re.sub(r'<[^>]+>', '', t).strip()
    if any(w in clean.lower() or w in href.lower() for w in ['matheran', 'diva', 'vasai', 'roha', 'panvel', 'memu', 'shuttle', 'daund']):
        print(f'{clean} -> {href}')

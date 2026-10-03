import pdfplumber, re

def inspect_pdf(fname):
    print(f"=== Inspecting {fname} ===")
    with pdfplumber.open(f'1- Official Time Tabel Data Storage/{fname}') as pdf:
        for p_idx in [0, 1, 10, 25, 50]:
            if p_idx >= len(pdf.pages):
                continue
            p = pdf.pages[p_idx]
            words = p.extract_words()
            t_nums = [w for w in words if re.match(r'^\b9\d{4}\b$', w['text'])]
            stns = [w for w in words if w['x0'] < 120 and w['text'] in ['VIRAR', 'CHURCHGATE', 'BORIVALI', 'ANDHERI', 'DADAR']]
            print(f"Page {p_idx+1}: found {len(t_nums)} train numbers: {[w['text'] for w in t_nums[:5]]}..., {len(stns)} key station labels")

inspect_pdf('WR_UP_TRAINS_PTT_79.pdf')
inspect_pdf('WR_DN_TRAINS_PTT_79.pdf')

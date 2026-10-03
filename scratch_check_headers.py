import pdfplumber, re

def check_headers(fname):
    print(f"=== {fname} ===")
    with pdfplumber.open(f'1- Official Time Tabel Data Storage/{fname}') as pdf:
        for p_idx in [0, 5, 15, 30, 50]:
            p = pdf.pages[p_idx]
            words = p.extract_words()
            t_nums = [w for w in words if re.match(r'^\b9\d{4}\b$', w['text'])]
            if t_nums:
                print(f"Page {p_idx+1}: {len(t_nums)} trains, Y top range: {min(w['top'] for w in t_nums):.1f} - {max(w['top'] for w in t_nums):.1f}")
            else:
                print(f"Page {p_idx+1}: No train numbers found!")

check_headers('WR_UP_TRAINS_PTT_79.pdf')
check_headers('WR_DN_TRAINS_PTT_79.pdf')

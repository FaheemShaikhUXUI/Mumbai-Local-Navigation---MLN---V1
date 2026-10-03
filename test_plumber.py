import pdfplumber

def test_pdfplumber(fname):
    print(f"\n--- Testing pdfplumber on {fname} ---")
    with pdfplumber.open(f'1- Official Time Tabel Data Storage/{fname}') as pdf:
        for p_idx in range(min(2, len(pdf.pages))):
            page = pdf.pages[p_idx]
            tables = page.extract_tables()
            print(f"Page {p_idx+1}: Found {len(tables)} tables")
            if tables:
                for t in tables[:1]:
                    print(f"  Table rows: {len(t)}, cols: {len(t[0]) if t else 0}")
                    for row in t[:5]:
                        print("   ", [c.replace('\n', ' ') if c else '' for c in row[:8]])

test_pdfplumber('CR_PORT_URAN_LINE_PTT.pdf')
test_pdfplumber('CR_TRANS_HARBOUR_PTT.pdf')
test_pdfplumber('CR_PUNE_LNL_PUNE_PTT.pdf')

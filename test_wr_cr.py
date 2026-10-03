import pdfplumber

def test_wr_cr(fname):
    print(f"\n--- Testing pdfplumber on {fname} ---")
    with pdfplumber.open(f'1- Official Time Tabel Data Storage/{fname}') as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()
        print(f"Page 1: Found {len(tables)} tables")
        if tables:
            for t in tables[:1]:
                print(f"  Table rows: {len(t)}, cols: {len(t[0]) if t else 0}")
                for row in t[:6]:
                    print("   ", [c.replace('\n', ' ') if c else '' for c in row[:8]])

test_wr_cr('WR_DN_TRAINS_PTT_79.pdf')
test_wr_cr('CR_MAIN_DN_PTT.pdf')
test_wr_cr('CR_HARBOUR_DN_PTT.pdf')

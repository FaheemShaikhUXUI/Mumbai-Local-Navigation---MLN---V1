import pypdf

reader = pypdf.PdfReader('1- Official Time Tabel Data Storage/WR_DN_TRAINS_PTT_79.pdf')
print(f"Total pages in WR DN: {len(reader.pages)}")
page = reader.pages[0]
lines = page.extract_text().split('\n')
print("\n--- Page 1 with pypdf ---")
for i, l in enumerate(lines[:25]):
    print(f"{i:2d}: {l}")

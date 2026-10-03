import os
import pypdf

path = os.path.join('1- Official Time Tabel Data Storage', 'CR_TRANS_HARBOUR_PTT.pdf')
reader = pypdf.PdfReader(path)
for p_idx, page in enumerate(reader.pages):
    lines = [l.strip() for l in page.extract_text().split('\n') if l.strip()]
    first_3 = lines[:3] if len(lines) >= 3 else lines
    print(f"Page {p_idx+1}: {first_3}")

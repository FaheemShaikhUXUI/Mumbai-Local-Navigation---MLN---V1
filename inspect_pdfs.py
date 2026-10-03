import os
import pypdf

folder = '1- Official Time Tabel Data Storage'
for f in os.listdir(folder):
    if f.endswith('.pdf'):
        path = os.path.join(folder, f)
        reader = pypdf.PdfReader(path)
        print(f"File: {f} | Pages: {len(reader.pages)}")
        # print first 300 chars of page 0
        if len(reader.pages) > 0:
            txt = reader.pages[0].extract_text()
            first_lines = '\n'.join([line.strip() for line in txt.split('\n') if line.strip()][:8])
            print(f"--- Sample preview ({f}) ---\n{first_lines}\n------------------------------")

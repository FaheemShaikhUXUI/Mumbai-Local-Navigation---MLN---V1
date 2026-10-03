import os
import pypdf

folder = '1- Official Time Tabel Data Storage'

def inspect_pdf(fname, page_num=0):
    path = os.path.join(folder, fname)
    if not os.path.exists(path):
        print(f"File {fname} not found")
        return
    reader = pypdf.PdfReader(path)
    print(f"\n==================== {fname} (Page {page_num+1}/{len(reader.pages)}) ====================")
    text = reader.pages[page_num].extract_text()
    lines = text.split('\n')
    for i, l in enumerate(lines[:30]):
        print(f"{i:2d}: {l}")

inspect_pdf('WR_DN_TRAINS_PTT_79.pdf', 0)
inspect_pdf('CR_MAIN_DN_PTT.pdf', 0)
inspect_pdf('CR_HARBOUR_DN_PTT.pdf', 0)
inspect_pdf('CR_TRANS_HARBOUR_PTT.pdf', 0)
inspect_pdf('CR_PORT_URAN_LINE_PTT.pdf', 0)
inspect_pdf('CR_PUNE_LNL_PUNE_PTT.pdf', 0)

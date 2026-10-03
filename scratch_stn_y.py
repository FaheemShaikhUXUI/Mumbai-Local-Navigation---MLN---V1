import pdfplumber

with pdfplumber.open('1- Official Time Tabel Data Storage/WR_UP_TRAINS_PTT_79.pdf') as pdf:
    p = pdf.pages[0]
    words = p.extract_words()
    stn_words = [w for w in words if w['x0'] < 130 and w['top'] > 80]
    for w in sorted(stn_words, key=lambda x: x['top']):
        print(f"{w['text']:20s} top={w['top']:.1f}, bottom={w['bottom']:.1f}")

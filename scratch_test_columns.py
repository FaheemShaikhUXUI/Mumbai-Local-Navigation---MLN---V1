import pdfplumber, re

with pdfplumber.open('1- Official Time Tabel Data Storage/WR_UP_TRAINS_PTT_79.pdf') as pdf:
    p = pdf.pages[50]
    words = p.extract_words()
    
    # Train 90976 is at x0=520.0 (x range 505 - 565)
    # Train 92234 is at x0=734.5 (x range 720 - 780)
    
    col_90976 = [w for w in words if 505 <= w['x0'] <= 560 and re.match(r'^\d{1,2}:\d{2}$', w['text'])]
    col_92234 = [w for w in words if 720 <= w['x0'] <= 775 and re.match(r'^\d{1,2}:\d{2}$', w['text'])]
    
    print("90976 times:", [(w['text'], f"top={w['top']:.1f}") for w in sorted(col_90976, key=lambda w: w['top'])])
    print("92234 times:", [(w['text'], f"top={w['top']:.1f}") for w in sorted(col_92234, key=lambda w: w['top'])])

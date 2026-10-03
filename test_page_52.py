import pdfplumber
from test_perfect_parser import parse_page_up

with pdfplumber.open('1- Official Time Tabel Data Storage/WR_UP_TRAINS_PTT_79.pdf') as pdf:
    # Page 52 (index 51)
    res = parse_page_up(pdf.pages[51])
    for r in res:
        print(f"Train {r['num']}: {r['orig']} -> {r['dest']} dep {r['dep']}, type: {r['type']}, stops: {r['stops']}")

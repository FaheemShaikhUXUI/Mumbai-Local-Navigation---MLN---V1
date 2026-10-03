import pdfplumber, re

WR_DN_STNS = [
    ('CCG', 100.6), ('MEL', 114.7), ('CYR', 129.0), ('GTR', 143.3),
    ('MMCT', 157.7), ('MX', 171.8), ('PL', 186.1), ('PBHD', 200.4),
    ('DR', 214.8), ('MRU', 229.0), ('MM', 243.2), ('BA', 257.6),
    ('KHAR', 271.8), ('STC', 286.1), ('VLP', 300.4), ('ADH', 314.8),
    ('JOS', 328.9), ('RMAR', 343.2), ('GMN', 357.5), ('MDD', 371.8),
    ('KILE', 386.0), ('BVI', 400.4), ('DIC', 414.6), ('MIRA', 428.9),
    ('BYR', 443.3), ('NIG', 457.4), ('BSR', 471.8), ('NSP', 486.0),
    ('VR', 500.4)
]

def parse_page_dn(p):
    words = p.extract_words()
    t_words = [w for w in words if re.match(r'^\b9\d{4}\b$', w['text']) and abs(w['top'] - 52.5) < 10]
    t_words.sort(key=lambda w: w['x0'])
    
    results = []
    for tw in t_words:
        t_num = tw['text']
        col_x = tw['x0']
        times = [w for w in words if abs(w['x0'] - col_x) < 26 and re.match(r'^\d{1,2}:\d{2}$', w['text']) and w['top'] > 80]
        stn_stops = []
        for t in times:
            best_stn = None
            min_dist = 999
            for stn_code, expected_y in WR_DN_STNS:
                dist = abs(t['top'] - expected_y)
                if dist < min_dist:
                    min_dist = dist
                    best_stn = stn_code
            if min_dist < 8:
                stn_stops.append((best_stn, t['text']))
        
        stn_stops.sort(key=lambda s: [code for code, _ in WR_DN_STNS].index(s[0]))
        if len(stn_stops) >= 2:
            orig = stn_stops[0][0]
            dest = stn_stops[-1][0]
            stops_codes = set(s[0] for s in stn_stops)
            
            local_stns = {'KILE', 'MDD', 'GMN', 'RMAR', 'JOS', 'VLP', 'STC', 'KHAR', 'MM', 'MRU', 'PBHD', 'PL', 'MX'}
            is_fast = False
            if 'CCG' in stops_codes and 'BVI' in stops_codes:
                skipped = local_stns - stops_codes
                if len(skipped) >= 3:
                    is_fast = True
            elif 'CCG' in stops_codes and 'ADH' in stops_codes:
                skipped = {'MM', 'MRU', 'PBHD', 'PL', 'MX'} - stops_codes
                if len(skipped) >= 2:
                    is_fast = True
            
            t_type = "FAST" if is_fast else "SLOW"
            if t_num.startswith('94'):
                t_type = f"AC_{t_type}"
                
            results.append({
                "num": t_num,
                "orig": orig,
                "dest": dest,
                "dep": stn_stops[0][1],
                "type": t_type,
                "stops": len(stn_stops)
            })
    return results

with pdfplumber.open('1- Official Time Tabel Data Storage/WR_DN_TRAINS_PTT_79.pdf') as pdf:
    # Page 1
    res = parse_page_dn(pdf.pages[0])
    for r in res:
        print(f"Train {r['num']}: {r['orig']} -> {r['dest']} dep {r['dep']}, type: {r['type']}, stops: {r['stops']}")

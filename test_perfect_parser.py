import pdfplumber, re

WR_UP_STNS = [
    ('VR', 103.1), ('NSP', 118.2), ('BSR', 133.6), ('NIG', 148.7),
    ('BYR', 164.0), ('MIRA', 179.2), ('DIC', 194.4), ('BVI', 209.8),
    ('KILE', 224.9), ('MDD', 240.1), ('GMN', 255.4), ('RMAR', 270.6),
    ('JOS', 285.8), ('ADH', 301.2), ('VLP', 316.3), ('STC', 331.6),
    ('KHAR', 346.8), ('BA', 362.2), ('MM', 377.3), ('MRU', 392.5),
    ('DR', 407.9), ('PBHD', 423.0), ('PL', 438.2), ('MX', 453.5),
    ('MMCT', 468.8), ('GTR', 484.0), ('CYR', 499.2), ('MEL', 514.4),
    ('CCG', 529.8)
]

def parse_page_up(p):
    words = p.extract_words()
    t_words = [w for w in words if re.match(r'^\b9\d{4}\b$', w['text']) and abs(w['top'] - 56.0) < 10]
    t_words.sort(key=lambda w: w['x0'])
    
    results = []
    for tw in t_words:
        t_num = tw['text']
        col_x = tw['x0']
        # Find all time words in this column
        times = [w for w in words if abs(w['x0'] - col_x) < 26 and re.match(r'^\d{1,2}:\d{2}$', w['text']) and w['top'] > 80]
        stn_stops = []
        for t in times:
            # find closest station
            best_stn = None
            min_dist = 999
            for stn_code, expected_y in WR_UP_STNS:
                dist = abs(t['top'] - expected_y)
                if dist < min_dist:
                    min_dist = dist
                    best_stn = stn_code
            if min_dist < 8:
                stn_stops.append((best_stn, t['text']))
        
        stn_stops.sort(key=lambda s: [code for code, _ in WR_UP_STNS].index(s[0]))
        if len(stn_stops) >= 2:
            orig = stn_stops[0][0]
            dest = stn_stops[-1][0]
            stops_codes = set(s[0] for s in stn_stops)
            
            # Check if it skips any local stations between Borivali and Churchgate
            local_stns = {'KILE', 'MDD', 'GMN', 'RMAR', 'JOS', 'VLP', 'STC', 'KHAR', 'MM', 'MRU', 'PBHD', 'PL', 'MX'}
            is_fast = False
            if 'BVI' in stops_codes and 'CCG' in stops_codes:
                skipped = local_stns - stops_codes
                if len(skipped) >= 3:
                    is_fast = True
            elif 'ADH' in stops_codes and 'CCG' in stops_codes:
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

with pdfplumber.open('1- Official Time Tabel Data Storage/WR_UP_TRAINS_PTT_79.pdf') as pdf:
    # Page 51 has 90976 and 92234
    res = parse_page_up(pdf.pages[50])
    for r in res:
        print(f"Train {r['num']}: {r['orig']} -> {r['dest']} dep {r['dep']}, type: {r['type']}, stops: {r['stops']}")

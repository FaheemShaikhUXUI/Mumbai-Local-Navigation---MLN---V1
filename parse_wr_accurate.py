import pdfplumber, re, json

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

WR_LOCAL_STNS = {'KILE', 'MDD', 'GMN', 'RMAR', 'JOS', 'VLP', 'STC', 'KHAR', 'MM', 'MRU', 'PBHD', 'PL', 'MX'}

def parse_wr_pdf(fname, direction, stn_defs):
    path = f'1- Official Time Tabel Data Storage/{fname}'
    trains = []
    stops = []
    routes = {}
    expected_header_y = 56.0 if direction == 'UP' else 52.5
    print(f"Parsing {fname} ({direction})...")
    
    with pdfplumber.open(path) as pdf:
        for p_idx, page in enumerate(pdf.pages):
            words = page.extract_words()
            t_words = [w for w in words if re.match(r'^\b9\d{4}\b$', w['text']) and abs(w['top'] - expected_header_y) < 14]
            t_words.sort(key=lambda w: w['x0'])
            
            # Check 15 CAR notes
            cars_words = [w for w in words if '15' in w['text'] and abs(w['top'] - (expected_header_y + 12)) < 8]
            
            for tw in t_words:
                t_num = tw['text']
                col_x = tw['x0']
                
                # Check 15 car
                is_15_car = any(abs(cw['x0'] - col_x) < 25 for cw in cars_words)
                cars = 15 if is_15_car else 12
                
                # Extract all times in this column
                times = [w for w in words if abs(w['x0'] - col_x) < 26 and re.match(r'^\d{1,2}:\d{2}$', w['text']) and w['top'] > 80]
                
                stn_stops = []
                for t in times:
                    best_stn = None
                    min_dist = 999
                    for stn_code, exp_y in stn_defs:
                        dist = abs(t['top'] - exp_y)
                        if dist < min_dist:
                            min_dist = dist
                            best_stn = stn_code
                    if min_dist < 8:
                        stn_stops.append((best_stn, t['text']))
                
                # Sort stops in natural direction order
                stn_order = [code for code, _ in stn_defs]
                stn_stops.sort(key=lambda s: stn_order.index(s[0]))
                
                # Deduplicate stops if any
                seen_stns = set()
                dedup_stops = []
                for s, time_val in stn_stops:
                    if s not in seen_stns:
                        seen_stns.add(s)
                        dedup_stops.append((s, time_val))
                
                if len(dedup_stops) >= 2:
                    orig = dedup_stops[0][0]
                    dest = dedup_stops[-1][0]
                    route_id = f"route_wr_{orig.lower()}_{dest.lower()}_{direction.lower()}"
                    if route_id not in routes:
                        routes[route_id] = {
                            "id": route_id,
                            "line_id": "line_wr_suburban",
                            "name": f"{orig} to {dest} ({direction})",
                            "direction": direction,
                            "origin_station_id": f"stn_{orig.lower()}",
                            "destination_station_id": f"stn_{dest.lower()}",
                            "description": f"Western Suburban Line {orig} to {dest}"
                        }
                    
                    stops_codes = set(s[0] for s in dedup_stops)
                    is_fast = False
                    if 'BVI' in stops_codes and 'CCG' in stops_codes:
                        skipped = WR_LOCAL_STNS - stops_codes
                        if len(skipped) >= 3:
                            is_fast = True
                    elif 'ADH' in stops_codes and 'CCG' in stops_codes:
                        skipped = {'MM', 'MRU', 'PBHD', 'PL', 'MX'} - stops_codes
                        if len(skipped) >= 2:
                            is_fast = True
                    elif 'VR' in orig and ('ADH' in dest or 'BA' in dest):
                        # Virar to Andheri: if skips local stations between BVI and ADH
                        skipped = {'KILE', 'MDD', 'GMN', 'RMAR', 'JOS'} - stops_codes
                        if len(skipped) >= 2:
                            is_fast = True
                    
                    is_ac = t_num.startswith('94')
                    t_type = "FAST" if is_fast else "SLOW"
                    if is_ac:
                        t_type = f"AC_{t_type}"
                    
                    dest_full = dest
                    if dest == 'CCG': dest_full = 'Churchgate'
                    elif dest == 'VR': dest_full = 'Virar'
                    elif dest == 'BVI': dest_full = 'Borivali'
                    elif dest == 'ADH': dest_full = 'Andheri'
                    elif dest == 'BA': dest_full = 'Bandra'
                    elif dest == 'BYR': dest_full = 'Bhayandar'
                    elif dest == 'BSR': dest_full = 'Vasai Road'
                    elif dest == 'DRD': dest_full = 'Dahanu Road'
                    
                    type_label = t_type.replace('_', ' ')
                    train_name = f"{dest_full} {type_label}"
                    train_id = f"train_wr_{t_num}"
                    
                    train_obj = {
                        "id": train_id,
                        "train_number": t_num,
                        "train_code": f"WR-{t_num[-2:]}",
                        "train_name": train_name,
                        "train_type": t_type,
                        "origin_station_id": f"stn_{orig.lower()}",
                        "destination_station_id": f"stn_{dest.lower()}",
                        "line_id": "line_wr_suburban",
                        "route_id": route_id,
                        "cars": cars,
                        "status": "ACTIVE"
                    }
                    trains.append(train_obj)
                    
                    for seq, (stn, t_str) in enumerate(dedup_stops, 1):
                        stops.append({
                            "id": f"stop_{train_id}_{seq}",
                            "train_id": train_id,
                            "station_id": f"stn_{stn.lower()}",
                            "sequence": seq,
                            "arrival_time": f"{t_str}:00" if len(t_str) == 5 else t_str,
                            "departure_time": f"{t_str}:00" if len(t_str) == 5 else t_str,
                            "day_pattern": "DAILY"
                        })
                        
    print(f"Extracted {len(trains)} trains, {len(stops)} stops from {fname}")
    return trains, stops, list(routes.values())

wr_up_trains, wr_up_stops, wr_up_routes = parse_wr_pdf('WR_UP_TRAINS_PTT_79.pdf', 'UP', WR_UP_STNS)
wr_dn_trains, wr_dn_stops, wr_dn_routes = parse_wr_pdf('WR_DN_TRAINS_PTT_79.pdf', 'DN', WR_DN_STNS)

with open('parsed_wr_trains.json', 'w') as f:
    json.dump({
        "trains": wr_up_trains + wr_dn_trains,
        "stops": wr_up_stops + wr_dn_stops,
        "routes": wr_up_routes + wr_dn_routes
    }, f, indent=2)

print("Saved accurate parsed_wr_trains.json!")

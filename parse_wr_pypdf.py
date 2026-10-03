import re
import json
import pypdf
from station_time_normalizer import normalize_station_name, clean_time

def parse_wr_pdf(fname, direction):
    path = f'1- Official Time Tabel Data Storage/{fname}'
    reader = pypdf.PdfReader(path)
    trains = []
    stops = []
    routes = {}
    print(f"Parsing {fname} ({len(reader.pages)} pages)...")
    
    for p_idx, page in enumerate(reader.pages):
        text = page.extract_text()
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        # Look for train numbers line (e.g. starting with numbers or "UP TRAINS" / "DN TRAINS")
        t_nums_line = None
        stn_target_line = None
        cars_line = None
        
        for l_idx, l in enumerate(lines[:6]):
            found_nums = re.findall(r'\b(9\d{4})\b', l)
            if len(found_nums) >= 2:
                t_nums_line = found_nums
                # The line before might be destination/origin station codes
                if l_idx > 0 and 'STATIONS' in lines[l_idx-1]:
                    stn_target_line = lines[l_idx-1].replace('STATIONS', '').split()
                # The line after might be cars
                if l_idx + 1 < len(lines) and 'CAR' in lines[l_idx+1]:
                    cars_line = re.findall(r'\b(12|15)\s*CAR\b', lines[l_idx+1])
                break
                
        if not t_nums_line:
            continue
            
        col_count = len(t_nums_line)
        train_stops_map = {idx: [] for idx in range(col_count)}
        
        # Read station lines
        for l in lines:
            # Check if line matches a known station prefix
            m_time = re.findall(r'\b(\d{1,2}[:.]\d{2})\b', l)
            if not m_time:
                continue
            # Remove all times and notes from line to get station name
            raw_stn = re.sub(r'\b\d{1,2}[:.]\d{2}\b', '', l)
            raw_stn = re.sub(r'\b(NOT ON|SUN ONLY|Air|Condition|ONLY|SA & SU|MON-SAT|DAILY)\b', '', raw_stn, flags=re.I).strip()
            if not raw_stn or len(raw_stn) < 3 or 'TRAIN' in raw_stn or 'STATION' in raw_stn or 'W.E.F' in raw_stn:
                continue
            stn_code = normalize_station_name(raw_stn)
            
            # Map times to columns
            # In pypdf, if a train skips, it doesn't print a time, but times are in ascending order per train
            # Let's clean the times
            times_found = [clean_time(t) for t in m_time if clean_time(t)]
            # If length of times_found matches col_count exactly:
            if len(times_found) == col_count:
                for c_i, t_val in enumerate(times_found):
                    if t_val:
                        train_stops_map[c_i].append((stn_code, t_val))
            elif len(times_found) > 0 and len(times_found) < col_count:
                # Distribute according to best position or sequential match
                for c_i, t_val in enumerate(times_found):
                    if c_i < col_count:
                        train_stops_map[c_i].append((stn_code, t_val))
                        
        for col_idx, t_num in enumerate(t_nums_line):
            s_list = train_stops_map[col_idx]
            if len(s_list) >= 2:
                # Deduplicate stops for same station in sequence
                filtered_stops = []
                last_stn = None
                for stn, tm in s_list:
                    if stn != last_stn:
                        filtered_stops.append((stn, tm))
                        last_stn = stn
                        
                if len(filtered_stops) >= 2:
                    orig = filtered_stops[0][0]
                    dest = filtered_stops[-1][0]
                    route_id = f"route_wr_{orig.lower()}_{dest.lower()}_{direction.lower()}"
                    if route_id not in routes:
                        routes[route_id] = {
                            "id": route_id,
                            "line_id": "line_wr_suburban",
                            "name": f"{orig} to {dest} ({direction})",
                            "direction": direction,
                            "origin_station_id": f"stn_{orig.lower()}",
                            "destination_station_id": f"stn_{dest.lower()}",
                            "description": f"Western Line {orig} to {dest}"
                        }
                    
                    car_num = 15 if (cars_line and col_idx < len(cars_line) and '15' in cars_line[col_idx]) else 12
                    t_type = "FAST" if len(filtered_stops) < 15 and ('VR' in dest or 'BVI' in dest or 'DRD' in dest) else "SLOW"
                    if t_num.startswith('94'):
                        t_type = f"AC_{t_type}"
                        
                    train_id = f"train_wr_{t_num}"
                    train_obj = {
                        "id": train_id,
                        "train_number": t_num,
                        "train_code": f"WR-{t_num[-2:]}",
                        "train_name": f"{dest} {t_type.replace('_', ' ')}",
                        "train_type": t_type,
                        "origin_station_id": f"stn_{orig.lower()}",
                        "destination_station_id": f"stn_{dest.lower()}",
                        "line_id": "line_wr_suburban",
                        "route_id": route_id,
                        "cars": car_num,
                        "status": "ACTIVE"
                    }
                    trains.append(train_obj)
                    
                    for seq, (stn, t_str) in enumerate(filtered_stops, 1):
                        stops.append({
                            "id": f"stop_{train_id}_{seq}",
                            "train_id": train_id,
                            "station_id": f"stn_{stn.lower()}",
                            "sequence": seq,
                            "arrival_time": t_str,
                            "departure_time": t_str,
                            "day_pattern": "DAILY"
                        })

    print(f"Extracted from {fname}: {len(trains)} trains, {len(stops)} stops, {len(routes)} routes.")
    return trains, stops, list(routes.values())

wr_dn_trains, wr_dn_stops, wr_dn_routes = parse_wr_pdf('WR_DN_TRAINS_PTT_79.pdf', 'DN')
wr_up_trains, wr_up_stops, wr_up_routes = parse_wr_pdf('WR_UP_TRAINS_PTT_79.pdf', 'UP')

with open('parsed_wr_trains.json', 'w') as f:
    json.dump({
        "trains": wr_dn_trains + wr_up_trains,
        "stops": wr_dn_stops + wr_up_stops,
        "routes": wr_dn_routes + wr_up_routes
    }, f, indent=2)
print("Saved to parsed_wr_trains.json!")

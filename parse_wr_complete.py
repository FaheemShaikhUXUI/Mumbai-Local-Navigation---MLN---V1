import re
import json
import pypdf
from station_time_normalizer import clean_time

WR_DN_STATIONS = [
    'CCG', 'MEL', 'CYR', 'GTR', 'MMCT', 'MX', 'PL', 'PBHD', 'DR', 'MRU',
    'MM', 'BA', 'KHAR', 'STC', 'VLP', 'ADH', 'JOS', 'RMAR', 'GMN', 'MDD',
    'KILE', 'BVI', 'DIC', 'MIRA', 'BYR', 'NIG', 'BSR', 'NSP', 'VR'
]

WR_UP_STATIONS = [
    'VR', 'NSP', 'BSR', 'NIG', 'BYR', 'MIRA', 'DIC', 'BVI', 'KILE', 'MDD',
    'GMN', 'RMAR', 'JOS', 'ADH', 'VLP', 'STC', 'KHAR', 'BA', 'MM', 'MRU',
    'DR', 'PBHD', 'PL', 'MX', 'MMCT', 'GTR', 'CYR', 'MEL', 'CCG'
]

def parse_wr_structured(fname, direction):
    path = f'1- Official Time Tabel Data Storage/{fname}'
    reader = pypdf.PdfReader(path)
    trains = []
    stops = []
    routes = {}
    stn_list = WR_DN_STATIONS if direction == 'DN' else WR_UP_STATIONS
    print(f"Parsing {fname} ({len(reader.pages)} pages)...")
    
    for p_idx, page in enumerate(reader.pages):
        lines = [l.strip() for l in page.extract_text().split('\n') if l.strip()]
        
        # Find train numbers line
        t_nums_idx = -1
        t_nums = []
        for l_idx, l in enumerate(lines):
            found_nums = re.findall(r'\b(9\d{4})\b', l)
            if len(found_nums) >= 4:
                t_nums_idx = l_idx
                t_nums = found_nums
                break
                
        if t_nums_idx == -1:
            continue
            
        cars_line = []
        if t_nums_idx + 1 < len(lines) and 'CAR' in lines[t_nums_idx + 1]:
            cars_line = re.findall(r'\b(12|15)\s*CAR\b', lines[t_nums_idx + 1])
            data_start = t_nums_idx + 2
        else:
            data_start = t_nums_idx + 1
            
        col_count = len(t_nums)
        # We expect around len(stn_list) = 29 data rows
        stn_times = {idx: [] for idx in range(col_count)}
        
        stn_idx = 0
        for r in lines[data_start:]:
            if stn_idx >= len(stn_list):
                break
            # Find times in line
            times_in_row = re.findall(r'\b(\d{1,2}:\d{2})\b', r)
            if not times_in_row:
                continue
                
            curr_stn = stn_list[stn_idx]
            # If times match col_count
            cleaned = [clean_time(t) for t in times_in_row]
            if len(cleaned) == col_count:
                for c_i, t_val in enumerate(cleaned):
                    if t_val:
                        stn_times[c_i].append((curr_stn, t_val))
                stn_idx += 1
            elif len(cleaned) > 0:
                # partial row (some trains skip this station)
                # Assign to the corresponding train columns
                for c_i, t_val in enumerate(cleaned):
                    if c_i < col_count and t_val:
                        stn_times[c_i].append((curr_stn, t_val))
                stn_idx += 1
                
        for col_idx, t_num in enumerate(t_nums):
            s_list = stn_times[col_idx]
            if len(s_list) >= 2:
                orig = s_list[0][0]
                dest = s_list[-1][0]
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
                car_num = 15 if (col_idx < len(cars_line) and '15' in cars_line[col_idx]) else 12
                t_type = "FAST" if len(s_list) < 14 and ('VR' in dest or 'BVI' in dest or 'DRD' in dest) else "SLOW"
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
                
                for seq, (stn, t_str) in enumerate(s_list, 1):
                    stops.append({
                        "id": f"stop_{train_id}_{seq}",
                        "train_id": train_id,
                        "station_id": f"stn_{stn.lower()}",
                        "sequence": seq,
                        "arrival_time": t_str,
                        "departure_time": t_str,
                        "day_pattern": "DAILY"
                    })

    print(f"Result for {fname}: {len(trains)} trains, {len(stops)} stops, {len(routes)} routes.")
    return trains, stops, list(routes.values())

wr_dn_trains, wr_dn_stops, wr_dn_routes = parse_wr_structured('WR_DN_TRAINS_PTT_79.pdf', 'DN')
wr_up_trains, wr_up_stops, wr_up_routes = parse_wr_structured('WR_UP_TRAINS_PTT_79.pdf', 'UP')

with open('parsed_wr_trains.json', 'w') as f:
    json.dump({
        "trains": wr_dn_trains + wr_up_trains,
        "stops": wr_dn_stops + wr_up_stops,
        "routes": wr_dn_routes + wr_up_routes
    }, f, indent=2)

print("Saved to parsed_wr_trains.json successfully!")

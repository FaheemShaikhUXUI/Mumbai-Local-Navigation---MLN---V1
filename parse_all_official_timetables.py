import os
import re
import json
import pdfplumber
from station_time_normalizer import normalize_station_name, clean_time

STORAGE_DIR = '1- Official Time Tabel Data Storage'

all_trains = []
all_stops = []
all_routes = {} # route_id -> route_dict

def add_route(route_id, line_id, name, direction, orig_code, dest_code, desc=""):
    if route_id not in all_routes:
        all_routes[route_id] = {
            "id": route_id,
            "line_id": line_id,
            "name": name,
            "direction": direction,
            "origin_station_id": f"stn_{orig_code.lower()}",
            "destination_station_id": f"stn_{dest_code.lower()}",
            "description": desc or name
        }

# ==========================================
# 1. PARSE CR TRANS-HARBOUR
# ==========================================
def parse_trans_harbour():
    path = os.path.join(STORAGE_DIR, 'CR_TRANS_HARBOUR_PTT.pdf')
    if not os.path.exists(path):
        return
    print("Parsing CR Trans-Harbour...")
    with pdfplumber.open(path) as pdf:
        for p_idx, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            for t in tables:
                if not t or len(t) < 3:
                    continue
                # Row 0: Train No. / Train Code
                header_row = t[0]
                # Check train numbers
                train_meta = [] # (col_idx, train_num, train_code)
                for col_idx in range(1, len(header_row)):
                    val = header_row[col_idx] or ''
                    # Match 5-digit train number
                    m = re.search(r'\b(9\d{4})\b', val)
                    if m:
                        t_num = m.group(1)
                        # Train code is the rest of the string
                        t_code = val.replace(t_num, '').strip()
                        # normalize code like TPL 1 -> TPL-01
                        t_code = re.sub(r'\s+', '-', t_code) if t_code else f"TH-{t_num[-2:]}"
                        train_meta.append((col_idx, t_num, t_code))
                
                if not train_meta:
                    continue
                
                # Rows 1..end: Station rows
                for col_idx, t_num, t_code in train_meta:
                    stops = []
                    direction = "DN" if int(t_num) % 2 != 0 else "UP"
                    for row_idx in range(1, len(t)):
                        row = t[row_idx]
                        if not row or len(row) <= col_idx:
                            continue
                        raw_stn = row[0]
                        if not raw_stn or 'Train' in raw_stn or 'Public' in raw_stn:
                            continue
                        stn_code = normalize_station_name(raw_stn)
                        time_val = clean_time(row[col_idx])
                        if time_val:
                            stops.append((stn_code, time_val))
                    
                    if len(stops) >= 2:
                        orig = stops[0][0]
                        dest = stops[-1][0]
                        route_id = f"route_cr_thb_{orig.lower()}_{dest.lower()}_{direction.lower()}"
                        add_route(route_id, "line_cr_trans_harbour", f"{orig} to {dest} ({direction})", direction, orig, dest)
                        
                        train_id = f"train_cr_{t_num}"
                        train_obj = {
                            "id": train_id,
                            "train_number": t_num,
                            "train_code": t_code,
                            "train_name": f"{dest} Trans-Harbour Local",
                            "train_type": "SLOW",
                            "origin_station_id": f"stn_{orig.lower()}",
                            "destination_station_id": f"stn_{dest.lower()}",
                            "line_id": "line_cr_trans_harbour",
                            "route_id": route_id,
                            "cars": 12,
                            "status": "ACTIVE"
                        }
                        all_trains.append(train_obj)
                        
                        for seq, (stn, t_str) in enumerate(stops, 1):
                            all_stops.append({
                                "id": f"stop_{train_id}_{seq}",
                                "train_id": train_id,
                                "station_id": f"stn_{stn.lower()}",
                                "sequence": seq,
                                "arrival_time": t_str,
                                "departure_time": t_str,
                                "day_pattern": "DAILY"
                            })

# ==========================================
# 2. PARSE CR PORT / URAN LINE
# ==========================================
def parse_uran_line():
    path = os.path.join(STORAGE_DIR, 'CR_PORT_URAN_LINE_PTT.pdf')
    if not os.path.exists(path):
        return
    print("Parsing CR Port/Uran Line...")
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for t in tables:
                if not t or len(t) < 5:
                    continue
                # In Uran line, there may be multiple sub-tables (DN: rows 0-12, UP: rows 13-25)
                # Let's inspect rows for "TR.NO" or "TR.CODE"
                header_indices = []
                for r_idx, row in enumerate(t):
                    if row and any('TR.NO' in (c or '') or 'TR.CODE' in (c or '') for c in row):
                        header_indices.append(r_idx)
                
                # Split table at header indices
                subsections = []
                for i in range(len(header_indices)):
                    start = header_indices[i]
                    end = header_indices[i+1] if i + 1 < len(header_indices) else len(t)
                    subsections.append(t[start:end])
                
                if not subsections:
                    subsections = [t]
                    
                for sub in subsections:
                    header_row = sub[0]
                    train_meta = []
                    for col_idx in range(1, len(header_row)):
                        val = header_row[col_idx] or ''
                        m = re.search(r'\b(9\d{4})\b', val)
                        if m:
                            t_num = m.group(1)
                            t_code = val.replace(t_num, '').strip()
                            t_code = re.sub(r'\s+', '-', t_code) if t_code else f"UR-{t_num[-2:]}"
                            train_meta.append((col_idx, t_num, t_code))
                            
                    for col_idx, t_num, t_code in train_meta:
                        stops = []
                        direction = "DN" if int(t_num) % 2 != 0 else "UP"
                        for row_idx in range(1, len(sub)):
                            row = sub[row_idx]
                            if not row or len(row) <= col_idx:
                                continue
                            raw_stn = row[0]
                            if not raw_stn or 'TR.NO' in raw_stn or 'PORT' in raw_stn:
                                continue
                            stn_code = normalize_station_name(raw_stn)
                            time_val = clean_time(row[col_idx])
                            if time_val:
                                stops.append((stn_code, time_val))
                                
                        if len(stops) >= 2:
                            orig = stops[0][0]
                            dest = stops[-1][0]
                            route_id = f"route_cr_uran_{orig.lower()}_{dest.lower()}_{direction.lower()}"
                            add_route(route_id, "line_cr_uran", f"{orig} to {dest} ({direction})", direction, orig, dest)
                            
                            train_id = f"train_cr_{t_num}"
                            train_obj = {
                                "id": train_id,
                                "train_number": t_num,
                                "train_code": t_code,
                                "train_name": f"{dest} Uran Local",
                                "train_type": "SLOW",
                                "origin_station_id": f"stn_{orig.lower()}",
                                "destination_station_id": f"stn_{dest.lower()}",
                                "line_id": "line_cr_uran",
                                "route_id": route_id,
                                "cars": 12,
                                "status": "ACTIVE"
                            }
                            all_trains.append(train_obj)
                            
                            for seq, (stn, t_str) in enumerate(stops, 1):
                                all_stops.append({
                                    "id": f"stop_{train_id}_{seq}",
                                    "train_id": train_id,
                                    "station_id": f"stn_{stn.lower()}",
                                    "sequence": seq,
                                    "arrival_time": t_str,
                                    "departure_time": t_str,
                                    "day_pattern": "DAILY"
                                })

# ==========================================
# 3. PARSE CR PUNE SUBURBAN
# ==========================================
def parse_pune_suburban():
    files = [
        ('CR_PUNE_LNL_PUNE_PTT.pdf', 'DN'),
        ('CR_PUNE_PUNE_LNL_PTT.pdf', 'UP')
    ]
    for fname, direction in files:
        path = os.path.join(STORAGE_DIR, fname)
        if not os.path.exists(path):
            continue
        print(f"Parsing Pune Suburban ({fname})...")
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for t in tables:
                    if not t or len(t) < 4:
                        continue
                    # Find row with train numbers (99xxx)
                    train_row_idx = -1
                    for r_idx, row in enumerate(t[:5]):
                        if any(re.search(r'\b99\d{3}\b', c or '') for c in row):
                            train_row_idx = r_idx
                            break
                    if train_row_idx == -1:
                        continue
                    
                    train_meta = []
                    for col_idx in range(len(t[train_row_idx])):
                        val = t[train_row_idx][col_idx] or ''
                        m = re.search(r'\b(99\d{3})\b', val)
                        if m:
                            t_num = m.group(1)
                            t_code = f"PUNE-{t_num[-2:]}"
                            train_meta.append((col_idx, t_num, t_code))
                            
                    for col_idx, t_num, t_code in train_meta:
                        stops = []
                        for row_idx in range(train_row_idx + 1, len(t)):
                            row = t[row_idx]
                            if not row or len(row) <= col_idx:
                                continue
                            raw_stn = row[0]
                            if not raw_stn or 'Train' in raw_stn or 'PUBLIC' in raw_stn:
                                continue
                            stn_code = normalize_station_name(raw_stn)
                            time_val = clean_time(row[col_idx])
                            if time_val:
                                stops.append((stn_code, time_val))
                                
                        if len(stops) >= 2:
                            orig = stops[0][0]
                            dest = stops[-1][0]
                            route_id = f"route_cr_pune_{orig.lower()}_{dest.lower()}_{direction.lower()}"
                            add_route(route_id, "line_cr_pune_suburban", f"{orig} to {dest} ({direction})", direction, orig, dest)
                            
                            train_id = f"train_cr_{t_num}"
                            train_obj = {
                                "id": train_id,
                                "train_number": t_num,
                                "train_code": t_code,
                                "train_name": f"{dest} Pune Suburban EMU",
                                "train_type": "SLOW",
                                "origin_station_id": f"stn_{orig.lower()}",
                                "destination_station_id": f"stn_{dest.lower()}",
                                "line_id": "line_cr_pune_suburban",
                                "route_id": route_id,
                                "cars": 12,
                                "status": "ACTIVE"
                            }
                            all_trains.append(train_obj)
                            
                            for seq, (stn, t_str) in enumerate(stops, 1):
                                all_stops.append({
                                    "id": f"stop_{train_id}_{seq}",
                                    "train_id": train_id,
                                    "station_id": f"stn_{stn.lower()}",
                                    "sequence": seq,
                                    "arrival_time": t_str,
                                    "departure_time": t_str,
                                    "day_pattern": "DAILY"
                                })

# ==========================================
# 4. PARSE CR HARBOUR LINE
# ==========================================
def parse_cr_harbour():
    files = [
        ('CR_HARBOUR_DN_PTT.pdf', 'DN'),
        ('CR_HARBOUR_UP_PTT.pdf', 'UP')
    ]
    for fname, direction in files:
        path = os.path.join(STORAGE_DIR, fname)
        if not os.path.exists(path):
            continue
        print(f"Parsing CR Harbour ({fname})...")
        with pdfplumber.open(path) as pdf:
            for p_idx, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                for t in tables:
                    if not t or len(t) < 4:
                        continue
                    # Find header row with train numbers (98xxx / 99xxx)
                    train_row_idx = -1
                    for r_idx, row in enumerate(t[:4]):
                        if any(re.search(r'\b9[89]\d{3}\b', c or '') for c in row):
                            train_row_idx = r_idx
                            break
                    if train_row_idx == -1:
                        continue
                        
                    train_meta = []
                    for col_idx in range(1, len(t[train_row_idx])):
                        val = t[train_row_idx][col_idx] or ''
                        m = re.search(r'\b(9[89]\d{3})\b', val)
                        if m:
                            t_num = m.group(1)
                            t_code = val.replace(t_num, '').strip()
                            t_code = re.sub(r'\s+', '-', t_code) if t_code else f"HB-{t_num[-2:]}"
                            t_type = "AC_SLOW" if 'AC' in val else "SLOW"
                            train_meta.append((col_idx, t_num, t_code, t_type))
                            
                    for col_idx, t_num, t_code, t_type in train_meta:
                        stops = []
                        for row_idx in range(train_row_idx + 1, len(t)):
                            row = t[row_idx]
                            if not row or len(row) <= col_idx:
                                continue
                            raw_stn = row[0]
                            if not raw_stn or 'Stations' in raw_stn or 'PANVEL' in raw_stn:
                                continue
                            stn_code = normalize_station_name(raw_stn)
                            time_val = clean_time(row[col_idx])
                            if time_val:
                                stops.append((stn_code, time_val))
                                
                        if len(stops) >= 2:
                            orig = stops[0][0]
                            dest = stops[-1][0]
                            route_id = f"route_cr_hb_{orig.lower()}_{dest.lower()}_{direction.lower()}"
                            add_route(route_id, "line_cr_harbour", f"{orig} to {dest} ({direction})", direction, orig, dest)
                            
                            train_id = f"train_cr_{t_num}"
                            train_obj = {
                                "id": train_id,
                                "train_number": t_num,
                                "train_code": t_code,
                                "train_name": f"{dest} Harbour Local",
                                "train_type": t_type,
                                "origin_station_id": f"stn_{orig.lower()}",
                                "destination_station_id": f"stn_{dest.lower()}",
                                "line_id": "line_cr_harbour",
                                "route_id": route_id,
                                "cars": 12,
                                "status": "ACTIVE"
                            }
                            all_trains.append(train_obj)
                            
                            for seq, (stn, t_str) in enumerate(stops, 1):
                                all_stops.append({
                                    "id": f"stop_{train_id}_{seq}",
                                    "train_id": train_id,
                                    "station_id": f"stn_{stn.lower()}",
                                    "sequence": seq,
                                    "arrival_time": t_str,
                                    "departure_time": t_str,
                                    "day_pattern": "DAILY"
                                })

# ==========================================
# 5. PARSE CR MAIN LINE
# ==========================================
def parse_cr_main():
    files = [
        ('CR_MAIN_DN_PTT.pdf', 'DN'),
        ('CR_MAIN_UP_PTT.pdf', 'UP')
    ]
    for fname, direction in files:
        path = os.path.join(STORAGE_DIR, fname)
        if not os.path.exists(path):
            continue
        print(f"Parsing CR Main Line ({fname})...")
        with pdfplumber.open(path) as pdf:
            for p_idx, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                for t in tables:
                    if not t or len(t) < 4:
                        continue
                    # Find header row with train numbers (95xxx / 96xxx / 97xxx)
                    train_row_idx = -1
                    for r_idx, row in enumerate(t[:4]):
                        if any(re.search(r'\b9[567]\d{3}\b', c or '') for c in row):
                            train_row_idx = r_idx
                            break
                    if train_row_idx == -1:
                        continue
                        
                    train_meta = []
                    for col_idx in range(1, len(t[train_row_idx])):
                        val = t[train_row_idx][col_idx] or ''
                        m = re.search(r'\b(9[567]\d{3})\b', val)
                        if m:
                            t_num = m.group(1)
                            t_code = val.replace(t_num, '').strip()
                            t_code = re.sub(r'\s+', '-', t_code) if t_code else f"CR-{t_num[-2:]}"
                            t_type = "FAST" if any(k in t_code for k in ['F', 'KAN', 'SKP']) else "SLOW"
                            if 'AC' in val:
                                t_type = f"AC_{t_type}"
                            train_meta.append((col_idx, t_num, t_code, t_type))
                            
                    for col_idx, t_num, t_code, t_type in train_meta:
                        stops = []
                        for row_idx in range(train_row_idx + 1, len(t)):
                            row = t[row_idx]
                            if not row or len(row) <= col_idx:
                                continue
                            raw_stn = row[0]
                            if not raw_stn or 'STATION' in raw_stn or 'KALYAN' in raw_stn:
                                continue
                            stn_code = normalize_station_name(raw_stn)
                            time_val = clean_time(row[col_idx])
                            if time_val:
                                stops.append((stn_code, time_val))
                                
                        if len(stops) >= 2:
                            orig = stops[0][0]
                            dest = stops[-1][0]
                            route_id = f"route_cr_main_{orig.lower()}_{dest.lower()}_{direction.lower()}"
                            add_route(route_id, "line_cr_main", f"{orig} to {dest} ({direction})", direction, orig, dest)
                            
                            train_id = f"train_cr_{t_num}"
                            train_obj = {
                                "id": train_id,
                                "train_number": t_num,
                                "train_code": t_code,
                                "train_name": f"{dest} {t_type.replace('_', ' ')}",
                                "train_type": t_type,
                                "origin_station_id": f"stn_{orig.lower()}",
                                "destination_station_id": f"stn_{dest.lower()}",
                                "line_id": "line_cr_main",
                                "route_id": route_id,
                                "cars": 12,
                                "status": "ACTIVE"
                            }
                            all_trains.append(train_obj)
                            
                            for seq, (stn, t_str) in enumerate(stops, 1):
                                all_stops.append({
                                    "id": f"stop_{train_id}_{seq}",
                                    "train_id": train_id,
                                    "station_id": f"stn_{stn.lower()}",
                                    "sequence": seq,
                                    "arrival_time": t_str,
                                    "departure_time": t_str,
                                    "day_pattern": "DAILY"
                                })

# ==========================================
# 6. PARSE WR DAHANU ROAD SERVICES
# ==========================================
def parse_wr_dahanu():
    path = os.path.join(STORAGE_DIR, 'WR_DAHANU_ROAD_SERVICES_PTT.pdf')
    if not os.path.exists(path):
        return
    print("Parsing WR Dahanu Road Services...")
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for t in tables:
                if not t or len(t) < 4:
                    continue
                # Look for row with 93xxx train numbers
                for r_idx, row in enumerate(t[:3]):
                    train_meta = []
                    for col_idx in range(len(row)):
                        val = row[col_idx] or ''
                        m = re.search(r'\b(93\d{3})\b', val)
                        if m:
                            t_num = m.group(1)
                            train_meta.append((col_idx, t_num))
                    if train_meta:
                        for col_idx, t_num in train_meta:
                            stops = []
                            for row_k in range(r_idx + 1, len(t)):
                                r_line = t[row_k]
                                if not r_line or len(r_line) <= col_idx:
                                    continue
                                raw_stn = r_line[0]
                                if not raw_stn or 'STATION' in raw_stn:
                                    continue
                                stn_code = normalize_station_name(raw_stn)
                                time_val = clean_time(r_line[col_idx])
                                if time_val:
                                    stops.append((stn_code, time_val))
                            if len(stops) >= 2:
                                orig = stops[0][0]
                                dest = stops[-1][0]
                                direction = "DN" if int(t_num) % 2 != 0 else "UP"
                                route_id = f"route_wr_drd_{orig.lower()}_{dest.lower()}_{direction.lower()}"
                                add_route(route_id, "line_wr_suburban", f"{orig} to {dest} ({direction})", direction, orig, dest)
                                
                                train_id = f"train_wr_{t_num}"
                                train_obj = {
                                    "id": train_id,
                                    "train_number": t_num,
                                    "train_code": f"DRD-{t_num[-2:]}",
                                    "train_name": f"{dest} Dahanu Suburban",
                                    "train_type": "FAST",
                                    "origin_station_id": f"stn_{orig.lower()}",
                                    "destination_station_id": f"stn_{dest.lower()}",
                                    "line_id": "line_wr_suburban",
                                    "route_id": route_id,
                                    "cars": 12,
                                    "status": "ACTIVE"
                                }
                                all_trains.append(train_obj)
                                for seq, (stn, t_str) in enumerate(stops, 1):
                                    all_stops.append({
                                        "id": f"stop_{train_id}_{seq}",
                                        "train_id": train_id,
                                        "station_id": f"stn_{stn.lower()}",
                                        "sequence": seq,
                                        "arrival_time": t_str,
                                        "departure_time": t_str,
                                        "day_pattern": "DAILY"
                                    })

# Execute all parsers
parse_trans_harbour()
parse_uran_line()
parse_pune_suburban()
parse_cr_harbour()
parse_cr_main()
parse_wr_dahanu()

print(f"\nParsing Summary:")
print(f"Total Trains Parsed: {len(all_trains)}")
print(f"Total Train Stops: {len(all_stops)}")
print(f"Total Routes Created: {len(all_routes)}")

# Deduplicate trains by train_number if any duplicates
seen_numbers = set()
unique_trains = []
valid_train_ids = set()
for t in all_trains:
    if t["train_number"] not in seen_numbers:
        seen_numbers.add(t["train_number"])
        unique_trains.append(t)
        valid_train_ids.add(t["id"])

unique_stops = [s for s in all_stops if s["train_id"] in valid_train_ids]
print(f"Unique Trains after deduplication: {len(unique_trains)}")
print(f"Valid Stops: {len(unique_stops)}")

with open('parsed_official_trains.json', 'w') as f:
    json.dump({
        "trains": unique_trains,
        "stops": unique_stops,
        "routes": list(all_routes.values())
    }, f, indent=2)

print("Saved to parsed_official_trains.json!")

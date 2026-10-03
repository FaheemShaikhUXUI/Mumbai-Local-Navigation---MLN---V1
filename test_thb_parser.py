import os
import re
import pypdf

def parse_trans_harbour():
    path = os.path.join('1- Official Time Tabel Data Storage', 'CR_TRANS_HARBOUR_PTT.pdf')
    reader = pypdf.PdfReader(path)
    total_trains = []
    print(f"Parsing Trans-Harbour ({len(reader.pages)} pages)...")
    for p_idx, page in enumerate(reader.pages):
        text = page.extract_text()
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        # Look for Train No. row and Train Code row
        train_nos = []
        train_codes = []
        station_times = {} # stn_code -> [times]
        
        for l in lines:
            if l.startswith("Train No."):
                train_nos = re.findall(r'\b\d{5}\b', l)
            elif l.startswith("Train Code"):
                # e.g. TPL 1 TPL 3 TV 1 TNU 1 ...
                # Let's extract tokens after "Train Code"
                codes_part = l.replace("Train Code", "").strip()
                # Split codes: e.g. "TPL 1", "TV 3"
                tokens = codes_part.split()
                # combine like [TPL, 1] -> TPL-1
                i = 0
                while i < len(tokens):
                    if i + 1 < len(tokens) and tokens[i+1].isdigit():
                        train_codes.append(f"{tokens[i]}-{tokens[i+1]}")
                        i += 2
                    else:
                        train_codes.append(tokens[i])
                        i += 1
            else:
                # Check if line starts with station code e.g. TNA, DIGH, AIRL, etc.
                parts = l.split()
                if len(parts) >= 2:
                    stn = parts[0]
                    # check if the rest are times (HH:MM or -)
                    times = parts[1:]
                    if any(re.match(r'^\d{2}:\d{2}$', t) for t in times):
                        station_times[stn] = times
                        
        if train_nos:
            print(f"  Page {p_idx+1}: Found {len(train_nos)} trains ({train_nos[:3]}...) codes ({train_codes[:3]}...)")
            for idx, t_num in enumerate(train_nos):
                t_code = train_codes[idx] if idx < len(train_codes) else f"TH-{t_num[-2:]}"
                stops = []
                for stn, times in station_times.items():
                    if idx < len(times):
                        t_val = times[idx]
                        if re.match(r'^\d{2}:\d{2}$', t_val):
                            stops.append((stn, t_val))
                if stops:
                    total_trains.append({"train_number": t_num, "code": t_code, "stops": stops})

    print(f"Extracted {len(total_trains)} total Trans-Harbour trains!")
    if total_trains:
        print("Sample train 1:", total_trains[0])

parse_trans_harbour()

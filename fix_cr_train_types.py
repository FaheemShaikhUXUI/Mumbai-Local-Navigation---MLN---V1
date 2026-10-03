import json

with open('parsed_official_trains.json', 'r') as f:
    cr = json.load(f)

stops_by_train = {}
for s in cr['stops']:
    stops_by_train.setdefault(s['train_id'], []).append(s['station_id'])

cr_local_stns = {'stn_msd', 'stn_snrd', 'stn_chg', 'stn_crd', 'stn_pr', 'stn_mtn', 'stn_sin', 'stn_vvh', 'stn_vk', 'stn_kjmg', 'stn_bnd', 'stn_nhu'}

fixed_count = 0
for t in cr['trains']:
    if t.get('line_id') == 'line_cr_main':
        stns = set(stops_by_train.get(t['id'], []))
        if 'stn_csmt' in stns and ('stn_tna' in stns or 'stn_kyn' in stns or 'stn_di' in stns):
            skipped = cr_local_stns - stns
            if len(skipped) >= 4:
                is_ac = 'AC' in t['train_type'] or 'AC' in t['train_name'] or t['train_number'].startswith('95') and 'AC' in t.get('train_code', '')
                t['train_type'] = 'AC_FAST' if is_ac else 'FAST'
                t['train_name'] = t['train_name'].replace(' SLOW', ' FAST')
                fixed_count += 1

print(f"Updated {fixed_count} CR Main Line trains to FAST / AC_FAST!")

with open('parsed_official_trains.json', 'w') as f:
    json.dump(cr, f, indent=2)

print("Saved updated parsed_official_trains.json!")

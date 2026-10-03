import os
import re
import json
import pdfplumber

STORAGE_DIR = '1- Official Time Tabel Data Storage'

# Station name / alias to station_code mapping
STATION_NAME_MAP = {
    # CR Main
    'csmt': 'CSMT', 'mumbai csmt': 'CSMT', 'cst': 'CSMT',
    'masjid': 'MSD',
    'sandhurst road': 'SNRD',
    'byculla': 'BY',
    'chinchpokli': 'CHG',
    'currey road': 'CRD',
    'parel': 'PR',
    'dadar': 'DR', 'dadar (cr)': 'DR', 'dadar (wr)': 'DR',
    'matunga': 'MTN',
    'sion': 'SIN',
    'kurla': 'CLA',
    'vidyavihar': 'VVH',
    'ghatkopar': 'GC',
    'vikhroli': 'VK',
    'kanjurmarg': 'KJRD', 'kanjur marg': 'KJRD',
    'bhandup': 'BND',
    'nahur': 'NHU',
    'mulund': 'MLND',
    'thane': 'TNA',
    'kalva': 'KLVA', 'kalwa': 'KLVA',
    'mumbra': 'MBQ',
    'diva': 'DIVA', 'diva jn': 'DIVA', 'diva junction': 'DIVA',
    'kopar': 'KOPR',
    'dombivli': 'DI', 'dombivali': 'DI',
    'thakurli': 'THK',
    'kalyan': 'KYN', 'kalyan jn': 'KYN',
    'shahad': 'SHAD',
    'ambivli': 'ABY',
    'titwala': 'TLW',
    'khadavli': 'KDV', 'khadavali': 'KDV',
    'vasind': 'VSD',
    'asangaon': 'ASO',
    'atgaon': 'ATG',
    'thansit': 'THS',
    'khardi': 'KE',
    'umbermali': 'UMB',
    'kasara': 'KSRA',
    'vithalwadi': 'VLDI', 'vitthalwadi': 'VLDI',
    'ulhasnagar': 'ULNR',
    'ambernath': 'ABH',
    'badlapur': 'BUD',
    'vangani': 'VGI',
    'shelu': 'SHLU',
    'neral': 'NRL', 'neral jn': 'NRL',
    'bhivpuri road': 'BVS',
    'karjat': 'KJT', 'karjat jn': 'KJT',
    'palasdari': 'PDI', 'palasdhari': 'PDI',
    'kelavli': 'KLY',
    'dolavali': 'DLV', 'dolavli': 'DLV',
    'lowjee': 'LWJ',
    'khopoli': 'KHPI',
    
    # Harbour Line
    'dockyard road': 'DKRD', 'dock yard road': 'DKRD',
    'reay road': 'RRD',
    'cotton green': 'CTGN',
    'sewri': 'SVE', 'sewree': 'SVE',
    'vadala road': 'VDLR', 'wadala': 'VDLR', 'wadala road': 'VDLR',
    'gtb nagar': 'GTBN', 'guru tegh bahadur nagar': 'GTBN',
    'chunabhatti': 'CHF',
    'tilaknagar': 'TKNG', 'tilak nagar': 'TKNG',
    'chembur': 'CMBR',
    'govandi': 'GV',
    'mankhurd': 'MNKD',
    'vashi': 'VSH',
    'sanpada': 'SNCR', 'snpd': 'SNCR',
    'juinagar': 'JNJ', 'jui nagar': 'JNJ',
    'nerul': 'NEU',
    'seawoods - darave': 'SWDV', 'seawoods darave karave': 'SWDV', 'seawoods': 'SWDV',
    'belapur': 'BEPR', 'belapur cbd': 'BEPR', 'cbd belapur': 'BEPR',
    'kharghar': 'KHAG',
    'mansarovar': 'MANR',
    'khandeshwar': 'KNDS',
    'panvel': 'PNVL',
    'kings circle': 'KCE', "king's circle": 'KCE',
    
    # Trans-Harbour
    'digha gaon': 'DIGHA', 'digha': 'DIGHA', 'digh': 'DIGHA',
    'airoli': 'AIRL',
    'rabale': 'RABE',
    'ghansoli': 'GNSL',
    'kopar khairane': 'KPHN', 'koparkhairane': 'KPHN',
    'turbhe': 'TUH',
    
    # Uran Line
    'sagar sangam': 'SGSG',
    'targhar': 'TRGR',
    'bamandongri': 'BMDR',
    'kharkopar': 'KARP',
    'gavan': 'GAVN', 'gavhan': 'GAVN',
    'ranjanpada': 'RJN', 'shematikhar': 'RJN',
    'nhava sheva': 'NHSV', 'nhave sheva': 'NHSV',
    'dronagiri': 'DRGI',
    'uran': 'URAN', 'uran city': 'URAN',
    'jasai': 'JSI',
    
    # Pune Suburban
    'thakurvadi': 'TKW',
    'monkey hill': 'MH',
    'khandala': 'KND',
    'lonavala': 'LNL', 'lonavla': 'LNL',
    'malavli': 'MVL', 'malavali': 'MVL',
    'kamshet': 'KMST',
    'kanhe': 'KNHE',
    'vadgaon': 'VDN',
    'talegaon': 'TGN',
    'ghorawadi': 'GRWD',
    'begdewadi': 'BGWI',
    'dehu road': 'DEHR',
    'akurdi': 'AKRD',
    'chinchwad': 'CCH',
    'pimpri': 'PMP',
    'kasarwadi': 'KSWD',
    'dapodi': 'DAPD',
    'khadki': 'KK',
    'shivajinagar': 'SVJR', 'shivaji nagar': 'SVJR',
    'pune': 'PUNE', 'pune jn': 'PUNE', 'pune junction': 'PUNE',
    
    # Western Line
    'churchgate': 'CCG', 'chuchgate': 'CCG',
    'marine lines': 'MEL',
    'charni road': 'CYR',
    'grant road': 'GTR',
    'mumbai central': 'MMCT', "m'bai central (l)": 'MMCT', "m'bai central": 'MMCT',
    'mahalaxmi': 'MX', 'mahalakshmi': 'MX',
    'lower parel': 'PL',
    'prabhadevi': 'PBHD',
    'matunga road': 'MRU',
    'mahim': 'MM', 'mahim jn.': 'MM', 'mahim jn': 'MM',
    'bandra': 'BA',
    'khar road': 'KHAR',
    'santacruz': 'STC', 'santa cruz': 'STC',
    'vile parle': 'VLP',
    'andheri': 'ADH',
    'jogeshwari': 'JOS',
    'ram mandir': 'RMAR',
    'goregaon': 'GMN',
    'malad': 'MDD',
    'kandivali': 'KILE', 'kandivli': 'KILE',
    'borivali': 'BVI', 'borivli': 'BVI',
    'dahisar': 'DIC',
    'mira road': 'MIRA',
    'bhayandar': 'BYR',
    'naigaon': 'NIG',
    'vasai road': 'BSR', 'vasai': 'BSR',
    'nallasopara': 'NSP', 'nala sopara': 'NSP',
    'virar': 'VR',
    'vaitarna': 'VTN',
    'saphale': 'SAH',
    'kelve road': 'KLV',
    'palghar': 'PLG',
    'umroli': 'UOI',
    'boisar': 'BOR',
    'vangaon': 'VGN',
    'dahanu road': 'DRD', 'dahanu': 'DRD'
}

def normalize_station_name(raw_name):
    clean = re.sub(r'[^a-zA-Z0-9\s]', '', raw_name).strip().lower()
    clean = re.sub(r'\s+', ' ', clean)
    if clean in STATION_NAME_MAP:
        return STATION_NAME_MAP[clean]
    # Check direct code
    code_candidate = raw_name.strip().upper()
    return code_candidate

def clean_time(time_str):
    if not time_str:
        return None
    time_str = time_str.strip().replace('.', ':')
    m = re.match(r'^(\d{1,2}):(\d{2})(:(\d{2}))?$', time_str)
    if m:
        hh = int(m.group(1))
        mm = int(m.group(2))
        ss = int(m.group(4) or 0)
        if 0 <= hh < 24 and 0 <= mm < 60 and 0 <= ss < 60:
            return f"{hh:02d}:{mm:02d}:{ss:02d}"
    return None

print("Timetable normalizer ready!")

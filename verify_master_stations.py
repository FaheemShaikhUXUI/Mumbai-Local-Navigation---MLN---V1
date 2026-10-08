# Complete Mumbai Suburban Railway Station Master List across all 8 Lines

STATIONS_DATA = [
    # ==========================================
    # 1. WESTERN LINE (Churchgate to Dahanu Road)
    # ==========================================
    {"code": "CCG", "name": "Churchgate", "aliases": ["CCG", "Church Gate"], "lat": 18.9322, "lng": 72.8264, "zone": "WR"},
    {"code": "MEL", "name": "Marine Lines", "aliases": ["MEL"], "lat": 18.9432, "lng": 72.8236, "zone": "WR"},
    {"code": "CYR", "name": "Charni Road", "aliases": ["CYR"], "lat": 18.9515, "lng": 72.8188, "zone": "WR"},
    {"code": "GTR", "name": "Grant Road", "aliases": ["GTR"], "lat": 18.9634, "lng": 72.8159, "zone": "WR"},
    {"code": "MMCT", "name": "Mumbai Central", "aliases": ["BCT", "Bombay Central", "Central"], "lat": 18.9696, "lng": 72.8193, "zone": "WR"},
    {"code": "MX", "name": "Mahalaxmi", "aliases": ["MX"], "lat": 18.9827, "lng": 72.8236, "zone": "WR"},
    {"code": "PL", "name": "Lower Parel", "aliases": ["PL"], "lat": 18.9958, "lng": 72.8296, "zone": "WR"},
    {"code": "PBHD", "name": "Prabhadevi", "aliases": ["PBHD", "Elphinstone Road", "EPR"], "lat": 19.0084, "lng": 72.8354, "zone": "WR"},
    {"code": "DR", "name": "Dadar", "aliases": ["DDR", "Dadar WR", "Dadar CR", "Dadar Western", "Dadar Central"], "lat": 19.0178, "lng": 72.8434, "zone": "CR"}, # Shared interchange canonical
    {"code": "MRU", "name": "Matunga Road", "aliases": ["MRU"], "lat": 19.0272, "lng": 72.8449, "zone": "WR"},
    {"code": "MM", "name": "Mahim Junction", "aliases": ["MM", "Mahim"], "lat": 19.0411, "lng": 72.8436, "zone": "WR"},
    {"code": "BA", "name": "Bandra", "aliases": ["BA", "Bandra Terminus", "BDTS"], "lat": 19.0544, "lng": 72.8406, "zone": "WR"},
    {"code": "KHAR", "name": "Khar Road", "aliases": ["KHAR", "Khar"], "lat": 19.0694, "lng": 72.8385, "zone": "WR"},
    {"code": "STC", "name": "Santacruz", "aliases": ["STC", "Santa Cruz"], "lat": 19.0818, "lng": 72.8415, "zone": "WR"},
    {"code": "VLP", "name": "Vile Parle", "aliases": ["VLP"], "lat": 19.0988, "lng": 72.8443, "zone": "WR"},
    {"code": "ADH", "name": "Andheri", "aliases": ["ADH", "Andheri West", "Andheri Metro"], "lat": 19.1197, "lng": 72.8464, "zone": "WR"},
    {"code": "JOS", "name": "Jogeshwari", "aliases": ["JOS"], "lat": 19.1352, "lng": 72.8491, "zone": "WR"},
    {"code": "RMAR", "name": "Ram Mandir", "aliases": ["RMAR", "RamMandir"], "lat": 19.1464, "lng": 72.8512, "zone": "WR"},
    {"code": "GMN", "name": "Goregaon", "aliases": ["GMN"], "lat": 19.1646, "lng": 72.8493, "zone": "WR"},
    {"code": "MDD", "name": "Malad", "aliases": ["MDD"], "lat": 19.1869, "lng": 72.8485, "zone": "WR"},
    {"code": "KILE", "name": "Kandivali", "aliases": ["KILE", "Kandivli"], "lat": 19.2046, "lng": 72.8524, "zone": "WR"},
    {"code": "BVI", "name": "Borivali", "aliases": ["BVI", "Borivli"], "lat": 19.2292, "lng": 72.8569, "zone": "WR"},
    {"code": "DIC", "name": "Dahisar", "aliases": ["DIC"], "lat": 19.2505, "lng": 72.8594, "zone": "WR"},
    {"code": "MIRA", "name": "Mira Road", "aliases": ["MIRA"], "lat": 19.2811, "lng": 72.8567, "zone": "WR"},
    {"code": "BYR", "name": "Bhayandar", "aliases": ["BYR", "Bhayander"], "lat": 19.3012, "lng": 72.8519, "zone": "WR"},
    {"code": "NIG", "name": "Naigaon", "aliases": ["NIG"], "lat": 19.3512, "lng": 72.8465, "zone": "WR"},
    {"code": "BSR", "name": "Vasai Road", "aliases": ["BSR", "Vasai", "Bassein Road"], "lat": 19.3814, "lng": 72.8335, "zone": "WR"},
    {"code": "NSP", "name": "Nallasopara", "aliases": ["NSP", "Nala Sopara"], "lat": 19.4184, "lng": 72.8188, "zone": "WR"},
    {"code": "VR", "name": "Virar", "aliases": ["VR"], "lat": 19.4552, "lng": 72.8105, "zone": "WR"},
    {"code": "VTN", "name": "Vaitarna", "aliases": ["VTN"], "lat": 19.5126, "lng": 72.8252, "zone": "WR"},
    {"code": "SAH", "name": "Saphale", "aliases": ["SAH"], "lat": 19.5784, "lng": 72.8211, "zone": "WR"},
    {"code": "KLV", "name": "Kelve Road", "aliases": ["KLV"], "lat": 19.6241, "lng": 72.7938, "zone": "WR"},
    {"code": "PLG", "name": "Palghar", "aliases": ["PLG"], "lat": 19.6974, "lng": 72.7663, "zone": "WR"},
    {"code": "UOI", "name": "Umroli", "aliases": ["UOI"], "lat": 19.7561, "lng": 72.7483, "zone": "WR"},
    {"code": "BOR", "name": "Boisar", "aliases": ["BOR"], "lat": 19.8035, "lng": 72.7562, "zone": "WR"},
    {"code": "VGN", "name": "Vangaon", "aliases": ["VGN"], "lat": 19.8821, "lng": 72.7412, "zone": "WR"},
    {"code": "DRD", "name": "Dahanu Road", "aliases": ["DRD", "Dahanu"], "lat": 19.9723, "lng": 72.7324, "zone": "WR"},

    # ==========================================
    # 2. CENTRAL MAIN LINE & BRANCHES (CSMT to Kalyan, Kasara & Khopoli)
    # ==========================================
    {"code": "CSMT", "name": "CSMT", "aliases": ["VT", "CST", "CSMT", "Victoria Terminus", "Mumbai CSMT"], "lat": 18.9401, "lng": 72.8354, "zone": "CR"},
    {"code": "MSD", "name": "Masjid", "aliases": ["MSD", "Masjid Bunder"], "lat": 18.9528, "lng": 72.8394, "zone": "CR"},
    {"code": "SNRD", "name": "Sandhurst Road", "aliases": ["SNRD"], "lat": 18.9612, "lng": 72.8398, "zone": "CR"},
    {"code": "BY", "name": "Byculla", "aliases": ["BY"], "lat": 18.9754, "lng": 72.8358, "zone": "CR"},
    {"code": "CHG", "name": "Chinchpokli", "aliases": ["CHG"], "lat": 18.9876, "lng": 72.8335, "zone": "CR"},
    {"code": "CRD", "name": "Currey Road", "aliases": ["CRD"], "lat": 18.9961, "lng": 72.8334, "zone": "CR"},
    {"code": "PR", "name": "Parel", "aliases": ["PR"], "lat": 19.0064, "lng": 72.8384, "zone": "CR"},
    {"code": "MTN", "name": "Matunga", "aliases": ["MTN", "Matunga CR"], "lat": 19.0268, "lng": 72.8552, "zone": "CR"},
    {"code": "SIN", "name": "Sion", "aliases": ["SIN"], "lat": 19.0415, "lng": 72.8624, "zone": "CR"},
    {"code": "CLA", "name": "Kurla", "aliases": ["CLA", "Kurla Jn"], "lat": 19.0652, "lng": 72.8794, "zone": "CR"},
    {"code": "VVH", "name": "Vidyavihar", "aliases": ["VVH"], "lat": 19.0784, "lng": 72.8964, "zone": "CR"},
    {"code": "GC", "name": "Ghatkopar", "aliases": ["GC", "Ghatkopar Metro"], "lat": 19.0864, "lng": 72.9082, "zone": "CR"},
    {"code": "VK", "name": "Vikhroli", "aliases": ["VK"], "lat": 19.1102, "lng": 72.9284, "zone": "CR"},
    {"code": "KJRD", "name": "Kanjurmarg", "aliases": ["KJRD", "Kanjur Marg"], "lat": 19.1274, "lng": 72.9372, "zone": "CR"},
    {"code": "BND", "name": "Bhandup", "aliases": ["BND"], "lat": 19.1415, "lng": 72.9362, "zone": "CR"},
    {"code": "NHU", "name": "Nahur", "aliases": ["NHU"], "lat": 19.1554, "lng": 72.9421, "zone": "CR"},
    {"code": "MLND", "name": "Mulund", "aliases": ["MLND"], "lat": 19.1724, "lng": 72.9564, "zone": "CR"},
    {"code": "TNA", "name": "Thane", "aliases": ["TNA", "Thane Jn"], "lat": 19.1864, "lng": 72.9754, "zone": "CR"},
    {"code": "KLVA", "name": "Kalva", "aliases": ["KLVA", "Kalwa"], "lat": 19.2012, "lng": 72.9964, "zone": "CR"},
    {"code": "MBQ", "name": "Mumbra", "aliases": ["MBQ"], "lat": 19.1794, "lng": 73.0184, "zone": "CR"},
    {"code": "DIVA", "name": "Diva Junction", "aliases": ["DIVA", "Diva"], "lat": 19.1894, "lng": 73.0424, "zone": "CR"},
    {"code": "KOPR", "name": "Kopar", "aliases": ["KOPR", "Upper Kopar"], "lat": 19.2084, "lng": 73.0784, "zone": "CR"},
    {"code": "DI", "name": "Dombivli", "aliases": ["DI", "Dombivali", "DL"], "lat": 19.2184, "lng": 73.0864, "zone": "CR"},
    {"code": "THK", "name": "Thakurli", "aliases": ["THK"], "lat": 19.2312, "lng": 73.1012, "zone": "CR"},
    {"code": "KYN", "name": "Kalyan Junction", "aliases": ["KYN", "Kalyan", "K"], "lat": 19.2354, "lng": 73.1302, "zone": "CR"},

    # Central - North-East Branch (Kalyan to Kasara)
    {"code": "SHAD", "name": "Shahad", "aliases": ["SHAD"], "lat": 19.2554, "lng": 73.1554, "zone": "CR"},
    {"code": "ABY", "name": "Ambivli", "aliases": ["ABY", "Ambivli"], "lat": 19.2784, "lng": 73.1784, "zone": "CR"},
    {"code": "TLW", "name": "Titwala", "aliases": ["TLW", "TL"], "lat": 19.2984, "lng": 73.2084, "zone": "CR"},
    {"code": "KDV", "name": "Khadavli", "aliases": ["KDV", "Khadavali"], "lat": 19.3684, "lng": 73.2484, "zone": "CR"},
    {"code": "VSD", "name": "Vasind", "aliases": ["VSD"], "lat": 19.4084, "lng": 73.2784, "zone": "CR"},
    {"code": "ASO", "name": "Asangaon", "aliases": ["ASO", "AN"], "lat": 19.4384, "lng": 73.3084, "zone": "CR"},
    {"code": "ATG", "name": "Atgaon", "aliases": ["ATG"], "lat": 19.4984, "lng": 73.3584, "zone": "CR"},
    {"code": "THS", "name": "Thansit", "aliases": ["THS"], "lat": 19.5384, "lng": 73.3884, "zone": "CR"},
    {"code": "KE", "name": "Khardi", "aliases": ["KE"], "lat": 19.5884, "lng": 73.4184, "zone": "CR"},
    {"code": "UMB", "name": "Umbermali", "aliases": ["UMB"], "lat": 19.6184, "lng": 73.4484, "zone": "CR"},
    {"code": "KSRA", "name": "Kasara", "aliases": ["KSRA", "N"], "lat": 19.6484, "lng": 73.4784, "zone": "CR"},

    # Central - South-East Branch (Kalyan to Karjat & Khopoli)
    {"code": "VLDI", "name": "Vithalwadi", "aliases": ["VLDI", "Vitthalwadi"], "lat": 19.2284, "lng": 73.1484, "zone": "CR"},
    {"code": "ULNR", "name": "Ulhasnagar", "aliases": ["ULNR"], "lat": 19.2184, "lng": 73.1684, "zone": "CR"},
    {"code": "ABH", "name": "Ambernath", "aliases": ["ABH", "A"], "lat": 19.2012, "lng": 73.1954, "zone": "CR"},
    {"code": "BUD", "name": "Badlapur", "aliases": ["BUD", "BL"], "lat": 19.1654, "lng": 73.2354, "zone": "CR"},
    {"code": "VGI", "name": "Vangani", "aliases": ["VGI"], "lat": 19.1084, "lng": 73.2784, "zone": "CR"},
    {"code": "SHLU", "name": "Shelu", "aliases": ["SHLU"], "lat": 19.0684, "lng": 73.3084, "zone": "CR"},
    {"code": "NRL", "name": "Neral Junction", "aliases": ["NRL", "Neral"], "lat": 19.0284, "lng": 73.3184, "zone": "CR"},
    {"code": "BVS", "name": "Bhivpuri Road", "aliases": ["BVS"], "lat": 18.9784, "lng": 73.3284, "zone": "CR"},
    {"code": "KJT", "name": "Karjat Junction", "aliases": ["KJT", "Karjat", "S"], "lat": 18.9124, "lng": 73.3284, "zone": "CR"},
    {"code": "PDI", "name": "Palasdari", "aliases": ["PDI", "Palasdhari"], "lat": 18.8884, "lng": 73.3384, "zone": "CR"},
    {"code": "KLY", "name": "Kelavli", "aliases": ["KLY"], "lat": 18.8584, "lng": 73.3484, "zone": "CR"},
    {"code": "DLV", "name": "Dolavali", "aliases": ["DLV", "Dolavli"], "lat": 18.8284, "lng": 73.3484, "zone": "CR"},
    {"code": "LWJ", "name": "Lowjee", "aliases": ["LWJ"], "lat": 18.8084, "lng": 73.3484, "zone": "CR"},
    {"code": "KHPI", "name": "Khopoli", "aliases": ["KHPI", "KP"], "lat": 18.7884, "lng": 73.3484, "zone": "CR"},

    # ==========================================
    # 3. HARBOUR LINE
    # ==========================================
    {"code": "DKRD", "name": "Dockyard Road", "aliases": ["DKRD"], "lat": 18.9684, "lng": 72.8424, "zone": "CR"},
    {"code": "RRD", "name": "Reay Road", "aliases": ["RRD"], "lat": 18.9784, "lng": 72.8454, "zone": "CR"},
    {"code": "CTGN", "name": "Cotton Green", "aliases": ["CTGN"], "lat": 18.9884, "lng": 72.8484, "zone": "CR"},
    {"code": "SVE", "name": "Sewri", "aliases": ["SVE", "Sewree"], "lat": 18.9984, "lng": 72.8524, "zone": "CR"},
    {"code": "VDLR", "name": "Vadala Road", "aliases": ["VDLR", "Wadala", "Wadala Road"], "lat": 19.0164, "lng": 72.8584, "zone": "CR"},
    {"code": "GTBN", "name": "Guru Tegh Bahadur Nagar", "aliases": ["GTBN", "GTB Nagar"], "lat": 19.0384, "lng": 72.8684, "zone": "CR"},
    {"code": "CHF", "name": "Chunabhatti", "aliases": ["CHF"], "lat": 19.0512, "lng": 72.8712, "zone": "CR"},
    {"code": "TKNG", "name": "Tilak Nagar", "aliases": ["TKNG", "Tilaknagar"], "lat": 19.0684, "lng": 72.8924, "zone": "CR"},
    {"code": "CMBR", "name": "Chembur", "aliases": ["CMBR", "CM"], "lat": 19.0612, "lng": 72.9024, "zone": "CR"},
    {"code": "GV", "name": "Govandi", "aliases": ["GV"], "lat": 19.0554, "lng": 72.9154, "zone": "CR"},
    {"code": "MNKD", "name": "Mankhurd", "aliases": ["MNKD", "M"], "lat": 19.0484, "lng": 72.9324, "zone": "CR"},
    {"code": "VSH", "name": "Vashi", "aliases": ["VSH", "V"], "lat": 19.0642, "lng": 72.9984, "zone": "CR"},
    {"code": "SNCR", "name": "Sanpada", "aliases": ["SNCR", "SNPD"], "lat": 19.0584, "lng": 73.0084, "zone": "CR"},
    {"code": "JNJ", "name": "Juinagar", "aliases": ["JNJ", "Jui Nagar"], "lat": 19.0484, "lng": 73.0184, "zone": "CR"},
    {"code": "NEU", "name": "Nerul Junction", "aliases": ["NEU", "Nerul"], "lat": 19.0342, "lng": 73.0184, "zone": "CR"},
    {"code": "SWDV", "name": "Seawoods - Darave", "aliases": ["SWDV", "Seawoods", "Seawoods Darave Karave"], "lat": 19.0224, "lng": 73.0224, "zone": "CR"},
    {"code": "BEPR", "name": "Belapur CBD", "aliases": ["BEPR", "CBD Belapur", "Belapur", "BR", "BP"], "lat": 19.0184, "lng": 73.0384, "zone": "CR"},
    {"code": "KHAG", "name": "Kharghar", "aliases": ["KHAG"], "lat": 19.0254, "lng": 73.0684, "zone": "CR"},
    {"code": "MANR", "name": "Mansarovar", "aliases": ["MANR"], "lat": 19.0184, "lng": 73.0884, "zone": "CR"},
    {"code": "KNDS", "name": "Khandeshwar", "aliases": ["KNDS"], "lat": 19.0084, "lng": 73.1024, "zone": "CR"},
    {"code": "PNVL", "name": "Panvel Junction", "aliases": ["PNVL", "Panvel", "PL", "P"], "lat": 18.9894, "lng": 73.1184, "zone": "CR"},
    # Harbour Western Branch
    {"code": "KCE", "name": "King's Circle", "aliases": ["KCE", "Kings Circle"], "lat": 19.0312, "lng": 72.8564, "zone": "CR"},

    # ==========================================
    # 4. TRANS-HARBOUR LINE (Thane to Navi Mumbai)
    # ==========================================
    {"code": "DIGHA", "name": "Digha Gaon", "aliases": ["DIGHA", "DIGH", "Digha"], "lat": 19.1684, "lng": 72.9884, "zone": "CR"},
    {"code": "AIRL", "name": "Airoli", "aliases": ["AIRL"], "lat": 19.1584, "lng": 72.9984, "zone": "CR"},
    {"code": "RABE", "name": "Rabale", "aliases": ["RABE"], "lat": 19.1412, "lng": 73.0084, "zone": "CR"},
    {"code": "GNSL", "name": "Ghansoli", "aliases": ["GNSL"], "lat": 19.1242, "lng": 73.0112, "zone": "CR"},
    {"code": "KPHN", "name": "Kopar Khairane", "aliases": ["KPHN", "Koparkhairane"], "lat": 19.1024, "lng": 73.0124, "zone": "CR"},
    {"code": "TUH", "name": "Turbhe", "aliases": ["TUH"], "lat": 19.0784, "lng": 73.0154, "zone": "CR"},

    # ==========================================
    # 5. URAN LINE (Port Line Corridor)
    # ==========================================
    {"code": "SGSG", "name": "Sagar Sangam", "aliases": ["SGSG"], "lat": 19.0124, "lng": 73.0184, "zone": "CR"},
    {"code": "TRGR", "name": "Targhar", "aliases": ["TRGR"], "lat": 18.9954, "lng": 73.0284, "zone": "CR"},
    {"code": "BMDR", "name": "Bamandongri", "aliases": ["BMDR"], "lat": 18.9812, "lng": 73.0212, "zone": "CR"},
    {"code": "KARP", "name": "Kharkopar", "aliases": ["KARP"], "lat": 18.9684, "lng": 73.0124, "zone": "CR"},
    {"code": "GAVN", "name": "Gavan", "aliases": ["GAVN", "Gavhan"], "lat": 18.9484, "lng": 73.0084, "zone": "CR"},
    {"code": "RJN", "name": "Ranjanpada", "aliases": ["RJN", "Shematikhar"], "lat": 18.9324, "lng": 73.0012, "zone": "CR"},
    {"code": "NHSV", "name": "Nhava Sheva", "aliases": ["NHSV", "Nhave Sheva"], "lat": 18.9184, "lng": 72.9884, "zone": "CR"},
    {"code": "DRGI", "name": "Dronagiri", "aliases": ["DRGI"], "lat": 18.9012, "lng": 72.9684, "zone": "CR"},
    {"code": "URAN", "name": "Uran City", "aliases": ["URAN", "Uran"], "lat": 18.8824, "lng": 72.9384, "zone": "CR"},
    {"code": "JSI", "name": "Jasai", "aliases": ["JSI", "Jasai Chirle"], "lat": 18.9224, "lng": 72.9612, "zone": "CR"},

    # ==========================================
    # 6. VASAI-DIVA-PANVEL LINE
    # ==========================================
    {"code": "JCNR", "name": "Juchandra", "aliases": ["JCNR", "Juchandra"], "lat": 19.3524, "lng": 72.8712, "zone": "CR"},
    {"code": "KARD", "name": "Kaman Road", "aliases": ["KARD", "Kaman"], "lat": 19.3324, "lng": 72.9124, "zone": "CR"},
    {"code": "KHBV", "name": "Kharbav", "aliases": ["KHBV", "Kharbao"], "lat": 19.2984, "lng": 72.9784, "zone": "CR"},
    {"code": "BIRD", "name": "Bhiwandi Road", "aliases": ["BIRD", "Bhivandi"], "lat": 19.2684, "lng": 73.0312, "zone": "CR"},
    {"code": "DTVL", "name": "Dativali", "aliases": ["DTVL"], "lat": 19.1712, "lng": 73.0612, "zone": "CR"},
    {"code": "NIIJ", "name": "Nilaje", "aliases": ["NIIJ", "Nilje"], "lat": 19.1384, "lng": 73.0812, "zone": "CR"},
    {"code": "TPND", "name": "Taloja Panchanand", "aliases": ["TPND", "Taloja"], "lat": 19.1024, "lng": 73.0984, "zone": "CR"},
    {"code": "NVRD", "name": "Navade Road", "aliases": ["NVRD"], "lat": 19.0612, "lng": 73.1112, "zone": "CR"},
    {"code": "KLMG", "name": "Kalamboli", "aliases": ["KLMG"], "lat": 19.0284, "lng": 73.1124, "zone": "CR"},

    # ==========================================
    # 7. NERAL-MATHERAN LINE (Matheran Hill Light Railway)
    # ==========================================
    {"code": "JTT", "name": "Jummapatti", "aliases": ["JTT"], "lat": 19.0084, "lng": 73.3084, "zone": "CR"},
    {"code": "WTP", "name": "Water Pipe", "aliases": ["WTP"], "lat": 18.9954, "lng": 73.2884, "zone": "CR"},
    {"code": "AMNA", "name": "Aman Lodge", "aliases": ["AMNA"], "lat": 18.9884, "lng": 73.2724, "zone": "CR"},
    {"code": "MAE", "name": "Matheran", "aliases": ["MAE"], "lat": 18.9854, "lng": 73.2684, "zone": "CR"},

    # ==========================================
    # 8. PUNE SUBURBAN LINE (Lonavala to Pune)
    # ==========================================
    {"code": "TKW", "name": "Thakurvadi", "aliases": ["TKW"], "lat": 18.8484, "lng": 73.3484, "zone": "CR"},
    {"code": "MH", "name": "Monkey Hill", "aliases": ["MH"], "lat": 18.8084, "lng": 73.3684, "zone": "CR"},
    {"code": "KND", "name": "Khandala", "aliases": ["KND"], "lat": 18.7612, "lng": 73.3754, "zone": "CR"},
    {"code": "LNL", "name": "Lonavala", "aliases": ["LNL", "Lonavla"], "lat": 18.7512, "lng": 73.4084, "zone": "CR"},
    {"code": "MVL", "name": "Malavli", "aliases": ["MVL", "Malavali"], "lat": 18.7412, "lng": 73.4684, "zone": "CR"},
    {"code": "KMST", "name": "Kamshet", "aliases": ["KMST"], "lat": 18.7584, "lng": 73.5584, "zone": "CR"},
    {"code": "KNHE", "name": "Kanhe", "aliases": ["KNHE"], "lat": 18.7524, "lng": 73.5984, "zone": "CR"},
    {"code": "VDN", "name": "Vadgaon", "aliases": ["VDN"], "lat": 18.7484, "lng": 73.6484, "zone": "CR"},
    {"code": "TGN", "name": "Talegaon", "aliases": ["TGN", "Talegaon Dabhade"], "lat": 18.7324, "lng": 73.6884, "zone": "CR"},
    {"code": "GRWD", "name": "Ghorawadi", "aliases": ["GRWD"], "lat": 18.7184, "lng": 73.7124, "zone": "CR"},
    {"code": "BGWI", "name": "Begdewadi", "aliases": ["BGWI", "Begdewadi / Shelarwadi"], "lat": 18.7084, "lng": 73.7312, "zone": "CR"},
    {"code": "DEHR", "name": "Dehu Road", "aliases": ["DEHR"], "lat": 18.6884, "lng": 73.7612, "zone": "CR"},
    {"code": "AKRD", "name": "Akurdi", "aliases": ["AKRD"], "lat": 18.6584, "lng": 73.7884, "zone": "CR"},
    {"code": "CCH", "name": "Chinchwad", "aliases": ["CCH"], "lat": 18.6384, "lng": 73.8084, "zone": "CR"},
    {"code": "PMP", "name": "Pimpri", "aliases": ["PMP"], "lat": 18.6254, "lng": 73.8184, "zone": "CR"},
    {"code": "KSWD", "name": "Kasarwadi", "aliases": ["KSWD"], "lat": 18.6084, "lng": 73.8284, "zone": "CR"},
    {"code": "DAPD", "name": "Dapodi", "aliases": ["DAPD"], "lat": 18.5884, "lng": 73.8384, "zone": "CR"},
    {"code": "KK", "name": "Khadki", "aliases": ["KK", "Kirkee"], "lat": 18.5684, "lng": 73.8484, "zone": "CR"},
    {"code": "SVJR", "name": "Shivajinagar", "aliases": ["SVJR", "Shivaji Nagar"], "lat": 18.5312, "lng": 73.8512, "zone": "CR"},
    {"code": "PUNE", "name": "Pune Junction", "aliases": ["PUNE", "Pune"], "lat": 18.5284, "lng": 73.8744, "zone": "CR"}
]

print("Total unique stations mapped:", len(STATIONS_DATA))
codes = set()
duplicates = []
for s in STATIONS_DATA:
    if s["code"] in codes:
        duplicates.append(s["code"])
    codes.add(s["code"])
print("Duplicate station codes:", duplicates)

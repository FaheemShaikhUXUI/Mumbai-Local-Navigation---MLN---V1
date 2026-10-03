import { Station, Line } from '@mumbai-timetable/types';

export const CR_OFFICIAL_STATIONS_DATA: Array<{
  code: string;
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
}> = [
  // ==========================================
  // 1. Central Main Line (CSMT to Kalyan)
  // ==========================================
  { code: 'CSMT', name: 'Chhatrapati Shivaji Maharaj Terminus', aliases: ['VT', 'CST', 'CSMT', 'Victoria Terminus', 'Mumbai CSMT'], lat: 18.9401, lng: 72.8354 },
  { code: 'MSD', name: 'Masjid', aliases: ['MSD', 'Masjid Bunder'], lat: 18.9528, lng: 72.8394 },
  { code: 'SNRD', name: 'Sandhurst Road', aliases: ['SNRD'], lat: 18.9612, lng: 72.8398 },
  { code: 'BY', name: 'Byculla', aliases: ['BY'], lat: 18.9754, lng: 72.8358 },
  { code: 'CHG', name: 'Chinchpokli', aliases: ['CHG'], lat: 18.9876, lng: 72.8335 },
  { code: 'CRD', name: 'Currey Road', aliases: ['CRD'], lat: 18.9961, lng: 72.8334 },
  { code: 'PR', name: 'Parel', aliases: ['PR'], lat: 19.0064, lng: 72.8384 },
  // Dadar is canonical station 'DR' shared with WR
  { code: 'MTN', name: 'Matunga', aliases: ['MTN', 'Matunga CR'], lat: 19.0268, lng: 72.8552 },
  { code: 'SIN', name: 'Sion', aliases: ['SIN'], lat: 19.0415, lng: 72.8624 },
  { code: 'CLA', name: 'Kurla', aliases: ['CLA', 'Kurla Jn'], lat: 19.0652, lng: 72.8794 },
  { code: 'VVH', name: 'Vidyavihar', aliases: ['VVH'], lat: 19.0784, lng: 72.8964 },
  { code: 'GC', name: 'Ghatkopar', aliases: ['GC', 'Ghatkopar Metro'], lat: 19.0864, lng: 72.9082 },
  { code: 'VK', name: 'Vikhroli', aliases: ['VK'], lat: 19.1102, lng: 72.9284 },
  { code: 'KJRD', name: 'Kanjurmarg', aliases: ['KJRD', 'Kanjur Marg'], lat: 19.1274, lng: 72.9372 },
  { code: 'BND', name: 'Bhandup', aliases: ['BND'], lat: 19.1415, lng: 72.9362 },
  { code: 'NHU', name: 'Nahur', aliases: ['NHU'], lat: 19.1554, lng: 72.9421 },
  { code: 'MLND', name: 'Mulund', aliases: ['MLND'], lat: 19.1724, lng: 72.9564 },
  { code: 'TNA', name: 'Thane', aliases: ['TNA', 'Thane Jn'], lat: 19.1864, lng: 72.9754 },
  { code: 'KLVA', name: 'Kalva', aliases: ['KLVA', 'Kalwa'], lat: 19.2012, lng: 72.9964 },
  { code: 'MBQ', name: 'Mumbra', aliases: ['MBQ'], lat: 19.1794, lng: 73.0184 },
  { code: 'DIVA', name: 'Diva Junction', aliases: ['DIVA', 'Diva'], lat: 19.1894, lng: 73.0424 },
  { code: 'KOPR', name: 'Kopar', aliases: ['KOPR', 'Upper Kopar'], lat: 19.2084, lng: 73.0784 },
  { code: 'DI', name: 'Dombivli', aliases: ['DI', 'Dombivali', 'DL'], lat: 19.2184, lng: 73.0864 },
  { code: 'THK', name: 'Thakurli', aliases: ['THK'], lat: 19.2312, lng: 73.1012 },
  { code: 'KYN', name: 'Kalyan Junction', aliases: ['KYN', 'Kalyan', 'K'], lat: 19.2354, lng: 73.1302 },

  // ==========================================
  // Central Main - North-East Branch (Kalyan to Kasara)
  // ==========================================
  { code: 'SHAD', name: 'Shahad', aliases: ['SHAD'], lat: 19.2554, lng: 73.1554 },
  { code: 'ABY', name: 'Ambivli', aliases: ['ABY'], lat: 19.2784, lng: 73.1784 },
  { code: 'TLW', name: 'Titwala', aliases: ['TLW', 'TL'], lat: 19.2984, lng: 73.2084 },
  { code: 'KDV', name: 'Khadavli', aliases: ['KDV', 'Khadavali'], lat: 19.3684, lng: 73.2484 },
  { code: 'VSD', name: 'Vasind', aliases: ['VSD'], lat: 19.4084, lng: 73.2784 },
  { code: 'ASO', name: 'Asangaon', aliases: ['ASO', 'AN'], lat: 19.4384, lng: 73.3084 },
  { code: 'ATG', name: 'Atgaon', aliases: ['ATG'], lat: 19.4984, lng: 73.3584 },
  { code: 'THS', name: 'Thansit', aliases: ['THS'], lat: 19.5384, lng: 73.3884 },
  { code: 'KE', name: 'Khardi', aliases: ['KE'], lat: 19.5884, lng: 73.4184 },
  { code: 'UMB', name: 'Umbermali', aliases: ['UMB'], lat: 19.6184, lng: 73.4484 },
  { code: 'KSRA', name: 'Kasara', aliases: ['KSRA', 'N'], lat: 19.6484, lng: 73.4784 },

  // ==========================================
  // Central Main - South-East Branch (Kalyan to Karjat & Khopoli)
  // ==========================================
  { code: 'VLDI', name: 'Vithalwadi', aliases: ['VLDI', 'Vitthalwadi'], lat: 19.2284, lng: 73.1484 },
  { code: 'ULNR', name: 'Ulhasnagar', aliases: ['ULNR'], lat: 19.2184, lng: 73.1684 },
  { code: 'ABH', name: 'Ambernath', aliases: ['ABH', 'A'], lat: 19.2012, lng: 73.1954 },
  { code: 'BUD', name: 'Badlapur', aliases: ['BUD', 'BL'], lat: 19.1654, lng: 73.2354 },
  { code: 'VGI', name: 'Vangani', aliases: ['VGI'], lat: 19.1084, lng: 73.2784 },
  { code: 'SHLU', name: 'Shelu', aliases: ['SHLU'], lat: 19.0684, lng: 73.3084 },
  { code: 'NRL', name: 'Neral Junction', aliases: ['NRL', 'Neral'], lat: 19.0284, lng: 73.3184 },
  { code: 'BVS', name: 'Bhivpuri Road', aliases: ['BVS'], lat: 18.9784, lng: 73.3284 },
  { code: 'KJT', name: 'Karjat Junction', aliases: ['KJT', 'Karjat', 'S'], lat: 18.9124, lng: 73.3284 },
  { code: 'PDI', name: 'Palasdari', aliases: ['PDI', 'Palasdhari'], lat: 18.8884, lng: 73.3384 },
  { code: 'KLY', name: 'Kelavli', aliases: ['KLY'], lat: 18.8584, lng: 73.3484 },
  { code: 'DLV', name: 'Dolavali', aliases: ['DLV', 'Dolavli'], lat: 18.8284, lng: 73.3484 },
  { code: 'LWJ', name: 'Lowjee', aliases: ['LWJ'], lat: 18.8084, lng: 73.3484 },
  { code: 'KHPI', name: 'Khopoli', aliases: ['KHPI', 'KP'], lat: 18.7884, lng: 73.3484 },

  // ==========================================
  // 2. Harbour Line (CSMT - Panvel & Vadala - Goregaon)
  // ==========================================
  { code: 'DKRD', name: 'Dockyard Road', aliases: ['DKRD'], lat: 18.9684, lng: 72.8424 },
  { code: 'RRD', name: 'Reay Road', aliases: ['RRD'], lat: 18.9784, lng: 72.8454 },
  { code: 'CTGN', name: 'Cotton Green', aliases: ['CTGN'], lat: 18.9884, lng: 72.8484 },
  { code: 'SVE', name: 'Sewri', aliases: ['SVE', 'Sewree'], lat: 18.9984, lng: 72.8524 },
  { code: 'VDLR', name: 'Vadala Road', aliases: ['VDLR', 'Wadala', 'Wadala Road'], lat: 19.0164, lng: 72.8584 },
  { code: 'GTBN', name: 'Guru Tegh Bahadur Nagar', aliases: ['GTBN', 'GTB Nagar'], lat: 19.0384, lng: 72.8684 },
  { code: 'CHF', name: 'Chunabhatti', aliases: ['CHF'], lat: 19.0512, lng: 72.8712 },
  { code: 'TKNG', name: 'Tilak Nagar', aliases: ['TKNG', 'Tilaknagar'], lat: 19.0684, lng: 72.8924 },
  { code: 'CMBR', name: 'Chembur', aliases: ['CMBR', 'CM'], lat: 19.0612, lng: 72.9024 },
  { code: 'GV', name: 'Govandi', aliases: ['GV'], lat: 19.0554, lng: 72.9154 },
  { code: 'MNKD', name: 'Mankhurd', aliases: ['MNKD', 'M'], lat: 19.0484, lng: 72.9324 },
  { code: 'VSH', name: 'Vashi', aliases: ['VSH', 'V'], lat: 19.0642, lng: 72.9984 },
  { code: 'SNCR', name: 'Sanpada', aliases: ['SNCR', 'SNPD'], lat: 19.0584, lng: 73.0084 },
  { code: 'JNJ', name: 'Juinagar', aliases: ['JNJ', 'Jui Nagar'], lat: 19.0484, lng: 73.0184 },
  { code: 'NEU', name: 'Nerul Junction', aliases: ['NEU', 'Nerul'], lat: 19.0342, lng: 73.0184 },
  { code: 'SWDV', name: 'Seawoods - Darave', aliases: ['SWDV', 'Seawoods', 'Seawoods Darave Karave'], lat: 19.0224, lng: 73.0224 },
  { code: 'BEPR', name: 'Belapur CBD', aliases: ['BEPR', 'CBD Belapur', 'Belapur', 'BR', 'BP'], lat: 19.0184, lng: 73.0384 },
  { code: 'KHAG', name: 'Kharghar', aliases: ['KHAG'], lat: 19.0254, lng: 73.0684 },
  { code: 'MANR', name: 'Mansarovar', aliases: ['MANR'], lat: 19.0184, lng: 73.0884 },
  { code: 'KNDS', name: 'Khandeshwar', aliases: ['KNDS'], lat: 19.0084, lng: 73.1024 },
  { code: 'PNVL', name: 'Panvel Junction', aliases: ['PNVL', 'Panvel', 'PL', 'P'], lat: 18.9894, lng: 73.1184 },
  // Harbour Western Branch
  { code: 'KCE', name: "King's Circle", aliases: ['KCE', 'Kings Circle'], lat: 19.0312, lng: 72.8564 },

  // ==========================================
  // 3. Trans-Harbour Line (Thane to Navi Mumbai)
  // ==========================================
  { code: 'DIGHA', name: 'Digha Gaon', aliases: ['DIGHA', 'DIGH', 'Digha'], lat: 19.1684, lng: 72.9884 },
  { code: 'AIRL', name: 'Airoli', aliases: ['AIRL'], lat: 19.1584, lng: 72.9984 },
  { code: 'RABE', name: 'Rabale', aliases: ['RABE'], lat: 19.1412, lng: 73.0084 },
  { code: 'GNSL', name: 'Ghansoli', aliases: ['GNSL'], lat: 19.1242, lng: 73.0112 },
  { code: 'KPHN', name: 'Kopar Khairane', aliases: ['KPHN', 'Koparkhairane'], lat: 19.1024, lng: 73.0124 },
  { code: 'TUH', name: 'Turbhe', aliases: ['TUH'], lat: 19.0784, lng: 73.0154 },

  // ==========================================
  // 4. Uran Line (Port Line Corridor)
  // ==========================================
  { code: 'SGSG', name: 'Sagar Sangam', aliases: ['SGSG'], lat: 19.0124, lng: 73.0184 },
  { code: 'TRGR', name: 'Targhar', aliases: ['TRGR'], lat: 18.9954, lng: 73.0284 },
  { code: 'BMDR', name: 'Bamandongri', aliases: ['BMDR'], lat: 18.9812, lng: 73.0212 },
  { code: 'KARP', name: 'Kharkopar', aliases: ['KARP'], lat: 18.9684, lng: 73.0124 },
  { code: 'GAVN', name: 'Gavan', aliases: ['GAVN', 'Gavhan'], lat: 18.9484, lng: 73.0084 },
  { code: 'RJN', name: 'Ranjanpada', aliases: ['RJN', 'Shematikhar'], lat: 18.9324, lng: 73.0012 },
  { code: 'NHSV', name: 'Nhava Sheva', aliases: ['NHSV', 'Nhave Sheva'], lat: 18.9184, lng: 72.9884 },
  { code: 'DRGI', name: 'Dronagiri', aliases: ['DRGI'], lat: 18.9012, lng: 72.9684 },
  { code: 'URAN', name: 'Uran City', aliases: ['URAN', 'Uran'], lat: 18.8824, lng: 72.9384 },
  { code: 'JSI', name: 'Jasai', aliases: ['JSI', 'Jasai Chirle'], lat: 18.9224, lng: 72.9612 },

  // ==========================================
  // 5. Vasai-Diva-Panvel Line
  // ==========================================
  { code: 'JCNR', name: 'Juchandra', aliases: ['JCNR', 'Juchandra'], lat: 19.3524, lng: 72.8712 },
  { code: 'KARD', name: 'Kaman Road', aliases: ['KARD', 'Kaman'], lat: 19.3324, lng: 72.9124 },
  { code: 'KHBV', name: 'Kharbav', aliases: ['KHBV', 'Kharbao'], lat: 19.2984, lng: 72.9784 },
  { code: 'BIRD', name: 'Bhiwandi Road', aliases: ['BIRD', 'Bhivandi'], lat: 19.2684, lng: 73.0312 },
  { code: 'DTVL', name: 'Dativali', aliases: ['DTVL'], lat: 19.1712, lng: 73.0612 },
  { code: 'NIIJ', name: 'Nilaje', aliases: ['NIIJ', 'Nilje'], lat: 19.1384, lng: 73.0812 },
  { code: 'TPND', name: 'Taloja Panchanand', aliases: ['TPND', 'Taloja'], lat: 19.1024, lng: 73.0984 },
  { code: 'NVRD', name: 'Navade Road', aliases: ['NVRD'], lat: 19.0612, lng: 73.1112 },
  { code: 'KLMG', name: 'Kalamboli', aliases: ['KLMG'], lat: 19.0284, lng: 73.1124 },

  // ==========================================
  // 6. Neral-Matheran Line (Matheran Hill Light Railway)
  // ==========================================
  { code: 'JTT', name: 'Jummapatti', aliases: ['JTT'], lat: 19.0084, lng: 73.3084 },
  { code: 'WTP', name: 'Water Pipe', aliases: ['WTP'], lat: 18.9954, lng: 73.2884 },
  { code: 'AMNA', name: 'Aman Lodge', aliases: ['AMNA'], lat: 18.9884, lng: 73.2724 },
  { code: 'MAE', name: 'Matheran', aliases: ['MAE'], lat: 18.9854, lng: 73.2684 },

  // ==========================================
  // 7. Pune Suburban Line (Lonavala to Pune)
  // ==========================================
  { code: 'TKW', name: 'Thakurvadi', aliases: ['TKW'], lat: 18.8484, lng: 73.3484 },
  { code: 'MH', name: 'Monkey Hill', aliases: ['MH'], lat: 18.8084, lng: 73.3684 },
  { code: 'KND', name: 'Khandala', aliases: ['KND'], lat: 18.7612, lng: 73.3754 },
  { code: 'LNL', name: 'Lonavala', aliases: ['LNL', 'Lonavla'], lat: 18.7512, lng: 73.4084 },
  { code: 'MVL', name: 'Malavli', aliases: ['MVL', 'Malavali'], lat: 18.7412, lng: 73.4684 },
  { code: 'KMST', name: 'Kamshet', aliases: ['KMST'], lat: 18.7584, lng: 73.5584 },
  { code: 'KNHE', name: 'Kanhe', aliases: ['KNHE'], lat: 18.7524, lng: 73.5984 },
  { code: 'VDN', name: 'Vadgaon', aliases: ['VDN'], lat: 18.7484, lng: 73.6484 },
  { code: 'TGN', name: 'Talegaon', aliases: ['TGN', 'Talegaon Dabhade'], lat: 18.7324, lng: 73.6884 },
  { code: 'GRWD', name: 'Ghorawadi', aliases: ['GRWD'], lat: 18.7184, lng: 73.7124 },
  { code: 'BGWI', name: 'Begdewadi', aliases: ['BGWI'], lat: 18.7084, lng: 73.7312 },
  { code: 'DEHR', name: 'Dehu Road', aliases: ['DEHR'], lat: 18.6884, lng: 73.7612 },
  { code: 'AKRD', name: 'Akurdi', aliases: ['AKRD'], lat: 18.6584, lng: 73.7884 },
  { code: 'CCH', name: 'Chinchwad', aliases: ['CCH'], lat: 18.6384, lng: 73.8084 },
  { code: 'PMP', name: 'Pimpri', aliases: ['PMP'], lat: 18.6254, lng: 73.8184 },
  { code: 'KSWD', name: 'Kasarwadi', aliases: ['KSWD'], lat: 18.6084, lng: 73.8284 },
  { code: 'DAPD', name: 'Dapodi', aliases: ['DAPD'], lat: 18.5884, lng: 73.8384 },
  { code: 'KK', name: 'Khadki', aliases: ['KK', 'Kirkee'], lat: 18.5684, lng: 73.8484 },
  { code: 'SVJR', name: 'Shivajinagar', aliases: ['SVJR', 'Shivaji Nagar'], lat: 18.5312, lng: 73.8512 },
  { code: 'PUNE', name: 'Pune Junction', aliases: ['PUNE', 'Pune'], lat: 18.5284, lng: 73.8744 },
];

export class CentralRailwayNormalizer {
  static getStations(): Station[] {
    return CR_OFFICIAL_STATIONS_DATA.map((s) => ({
      id: `stn_${s.code.toLowerCase()}`,
      station_code: s.code,
      station_name: s.name,
      normalized_name: s.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      aliases: s.aliases,
      latitude: s.lat,
      longitude: s.lng,
      zone: 'CR',
      status: 'ACTIVE',
    }));
  }

  static getLines(): Line[] {
    return [
      {
        id: 'line_cr_main',
        railway_id: 'railway_cr',
        code: 'CR_MAIN',
        name: 'Central Main Line',
        color: '#B91C1C', // Central Maroon
        order_seq: 2,
      },
      {
        id: 'line_cr_harbour',
        railway_id: 'railway_cr',
        code: 'HARBOUR',
        name: 'Harbour Line',
        color: '#0284C7', // Harbour Blue
        order_seq: 3,
      },
      {
        id: 'line_cr_trans_harbour',
        railway_id: 'railway_cr',
        code: 'TRANS_HARBOUR',
        name: 'Trans-Harbour Line',
        color: '#16A34A', // Trans-Harbour Green
        order_seq: 4,
      },
      {
        id: 'line_cr_uran',
        railway_id: 'railway_cr',
        code: 'URAN_LINE',
        name: 'Uran Line',
        color: '#EAB308', // Uran Gold/Yellow
        order_seq: 5,
      },
      {
        id: 'line_cr_vasai_diva_panvel',
        railway_id: 'railway_cr',
        code: 'VASAI_DIVA_PANVEL',
        name: 'Vasai-Diva-Panvel Line',
        color: '#8B5CF6', // Purple
        order_seq: 6,
      },
      {
        id: 'line_cr_neral_matheran',
        railway_id: 'railway_cr',
        code: 'NERAL_MATHERAN',
        name: 'Neral-Matheran Line',
        color: '#F97316', // Orange
        order_seq: 7,
      },
      {
        id: 'line_cr_pune_suburban',
        railway_id: 'railway_cr',
        code: 'PUNE_SUBURBAN',
        name: 'Pune Suburban Line',
        color: '#0D9488', // Teal
        order_seq: 8,
      },
    ];
  }
}

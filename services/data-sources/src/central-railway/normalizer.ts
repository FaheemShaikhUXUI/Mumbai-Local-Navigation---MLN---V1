import { Station, Line } from '@mumbai-timetable/types';

export const CR_OFFICIAL_STATIONS_DATA: Array<{
  code: string;
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
}> = [
  // Central Main Line
  { code: 'CSMT', name: 'Chhatrapati Shivaji Maharaj Terminus', aliases: ['VT', 'CST', 'CSMT', 'Victoria Terminus', 'Mumbai CSMT'], lat: 18.9401, lng: 72.8354 },
  { code: 'MSD', name: 'Masjid', aliases: ['MSD'], lat: 18.9528, lng: 72.8394 },
  { code: 'SNRD', name: 'Sandhurst Road', aliases: ['SNRD'], lat: 18.9612, lng: 72.8398 },
  { code: 'BY', name: 'Byculla', aliases: ['BY'], lat: 18.9754, lng: 72.8358 },
  { code: 'CHG', name: 'Chinchpokli', aliases: ['CHG'], lat: 18.9876, lng: 72.8335 },
  { code: 'CRD', name: 'Currey Road', aliases: ['CRD'], lat: 18.9961, lng: 72.8334 },
  { code: 'PR', name: 'Parel', aliases: ['PR'], lat: 19.0064, lng: 72.8384 },
  // Dadar is canonical station 'DR' shared with WR!
  { code: 'MTN', name: 'Matunga', aliases: ['MTN', 'Matunga CR'], lat: 19.0268, lng: 72.8552 },
  { code: 'SIN', name: 'Sion', aliases: ['SIN'], lat: 19.0415, lng: 72.8624 },
  { code: 'CLA', name: 'Kurla', aliases: ['CLA', 'Kurla Jn'], lat: 19.0652, lng: 72.8794 },
  { code: 'VVH', name: 'Vidyavihar', aliases: ['VVH'], lat: 19.0784, lng: 72.8964 },
  { code: 'GC', name: 'Ghatkopar', aliases: ['GC', 'Ghatkopar Metro'], lat: 19.0864, lng: 72.9082 },
  { code: 'VK', name: 'Vikhroli', aliases: ['VK'], lat: 19.1102, lng: 72.9284 },
  { code: 'KJRD', name: 'Kanjurmarg', aliases: ['KJRD'], lat: 19.1274, lng: 72.9372 },
  { code: 'BND', name: 'Bhandup', aliases: ['BND'], lat: 19.1415, lng: 72.9362 },
  { code: 'NHU', name: 'Nahur', aliases: ['NHU'], lat: 19.1554, lng: 72.9421 },
  { code: 'MLND', name: 'Mulund', aliases: ['MLND'], lat: 19.1724, lng: 72.9564 },
  { code: 'TNA', name: 'Thane', aliases: ['TNA', 'Thane Jn'], lat: 19.1864, lng: 72.9754 },
  { code: 'KLVA', name: 'Kalva', aliases: ['KLVA'], lat: 19.2012, lng: 72.9964 },
  { code: 'MBQ', name: 'Mumbra', aliases: ['MBQ'], lat: 19.1794, lng: 73.0184 },
  { code: 'DIVA', name: 'Diva', aliases: ['DIVA', 'Diva Jn'], lat: 19.1894, lng: 73.0424 },
  { code: 'KOPR', name: 'Kopar', aliases: ['KOPR'], lat: 19.2084, lng: 73.0784 },
  { code: 'DI', name: 'Dombivli', aliases: ['DI', 'Dombivali'], lat: 19.2184, lng: 73.0864 },
  { code: 'THK', name: 'Thakurli', aliases: ['THK'], lat: 19.2312, lng: 73.1012 },
  { code: 'KYN', name: 'Kalyan', aliases: ['KYN', 'Kalyan Jn'], lat: 19.2354, lng: 73.1302 },
  // Kasara branch
  { code: 'TLW', name: 'Titwala', aliases: ['TLW'], lat: 19.2984, lng: 73.2084 },
  { code: 'ASO', name: 'Asangaon', aliases: ['ASO'], lat: 19.4384, lng: 73.3084 },
  { code: 'KSRA', name: 'Kasara', aliases: ['KSRA'], lat: 19.6484, lng: 73.4784 },
  // Karjat branch
  { code: 'ABH', name: 'Ambernath', aliases: ['ABH'], lat: 19.2012, lng: 73.1954 },
  { code: 'BUD', name: 'Badlapur', aliases: ['BUD'], lat: 19.1654, lng: 73.2354 },
  { code: 'NRL', name: 'Neral', aliases: ['NRL', 'Neral Jn'], lat: 19.0284, lng: 73.3184 },
  { code: 'KJT', name: 'Karjat', aliases: ['KJT', 'Karjat Jn'], lat: 18.9124, lng: 73.3284 },
  { code: 'KHPI', name: 'Khopoli', aliases: ['KHPI'], lat: 18.7884, lng: 73.3484 },
  // Harbour Line
  { code: 'VDLR', name: 'Vadala Road', aliases: ['VDLR', 'Wadala', 'Wadala Road'], lat: 19.0164, lng: 72.8584 },
  { code: 'CHF', name: 'Chunabhatti', aliases: ['CHF'], lat: 19.0512, lng: 72.8712 },
  { code: 'MNKD', name: 'Mankhurd', aliases: ['MNKD'], lat: 19.0484, lng: 72.9324 },
  { code: 'VSH', name: 'Vashi', aliases: ['VSH'], lat: 19.0642, lng: 72.9984 },
  { code: 'NEU', name: 'Nerul', aliases: ['NEU', 'Nerul Jn'], lat: 19.0342, lng: 73.0184 },
  { code: 'BEPR', name: 'Belapur CBD', aliases: ['BEPR', 'CBD Belapur', 'Belapur'], lat: 19.0184, lng: 73.0384 },
  { code: 'PNVL', name: 'Panvel', aliases: ['PNVL', 'Panvel Jn'], lat: 18.9894, lng: 73.1184 },
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
    ];
  }
}

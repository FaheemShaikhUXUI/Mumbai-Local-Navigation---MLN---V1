import { Station, Train, TrainStop, Route, Line } from '@mumbai-timetable/types';

export const WR_OFFICIAL_STATIONS_DATA: Array<{
  code: string;
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
}> = [
  { code: 'CCG', name: 'Churchgate', aliases: ['CCG', 'Church Gate'], lat: 18.9322, lng: 72.8264 },
  { code: 'MEL', name: 'Marine Lines', aliases: ['MEL'], lat: 18.9432, lng: 72.8236 },
  { code: 'CYR', name: 'Charni Road', aliases: ['CYR'], lat: 18.9515, lng: 72.8188 },
  { code: 'GTR', name: 'Grant Road', aliases: ['GTR'], lat: 18.9634, lng: 72.8159 },
  { code: 'MMCT', name: 'Mumbai Central', aliases: ['BCT', 'Bombay Central', 'Central'], lat: 18.9696, lng: 72.8193 },
  { code: 'MX', name: 'Mahalaxmi', aliases: ['MX'], lat: 18.9827, lng: 72.8236 },
  { code: 'PL', name: 'Lower Parel', aliases: ['PL'], lat: 18.9958, lng: 72.8296 },
  { code: 'PBHD', name: 'Prabhadevi', aliases: ['PBHD', 'Elphinstone Road', 'EPR'], lat: 19.0084, lng: 72.8354 },
  { code: 'DR', name: 'Dadar', aliases: ['DDR', 'Dadar WR', 'Dadar Western'], lat: 19.0178, lng: 72.8434 },
  { code: 'MRU', name: 'Matunga Road', aliases: ['MRU'], lat: 19.0272, lng: 72.8449 },
  { code: 'MM', name: 'Mahim', aliases: ['MM'], lat: 19.0411, lng: 72.8436 },
  { code: 'BA', name: 'Bandra', aliases: ['BA', 'Bandra Terminus'], lat: 19.0544, lng: 72.8406 },
  { code: 'KHAR', name: 'Khar Road', aliases: ['KHAR'], lat: 19.0694, lng: 72.8385 },
  { code: 'STC', name: 'Santacruz', aliases: ['STC'], lat: 19.0818, lng: 72.8415 },
  { code: 'VLP', name: 'Vile Parle', aliases: ['VLP'], lat: 19.0988, lng: 72.8443 },
  { code: 'ADH', name: 'Andheri', aliases: ['ADH'], lat: 19.1197, lng: 72.8464 },
  { code: 'JOS', name: 'Jogeshwari', aliases: ['JOS'], lat: 19.1352, lng: 72.8491 },
  { code: 'RMAR', name: 'Ram Mandir', aliases: ['RMAR'], lat: 19.1464, lng: 72.8512 },
  { code: 'GMN', name: 'Goregaon', aliases: ['GMN'], lat: 19.1646, lng: 72.8493 },
  { code: 'MDD', name: 'Malad', aliases: ['MDD'], lat: 19.1869, lng: 72.8485 },
  { code: 'KILE', name: 'Kandivali', aliases: ['KILE'], lat: 19.2046, lng: 72.8524 },
  { code: 'BVI', name: 'Borivali', aliases: ['BVI'], lat: 19.2292, lng: 72.8569 },
  { code: 'DIC', name: 'Dahisar', aliases: ['DIC'], lat: 19.2505, lng: 72.8594 },
  { code: 'MIRA', name: 'Mira Road', aliases: ['MIRA'], lat: 19.2811, lng: 72.8567 },
  { code: 'BYR', name: 'Bhayandar', aliases: ['BYR'], lat: 19.3012, lng: 72.8519 },
  { code: 'NIG', name: 'Naigaon', aliases: ['NIG'], lat: 19.3512, lng: 72.8465 },
  { code: 'BSR', name: 'Vasai Road', aliases: ['BSR', 'Vasai'], lat: 19.3814, lng: 72.8335 },
  { code: 'NSP', name: 'Nallasopara', aliases: ['NSP'], lat: 19.4184, lng: 72.8188 },
  { code: 'VR', name: 'Virar', aliases: ['VR'], lat: 19.4552, lng: 72.8105 },
  { code: 'VTN', name: 'Vaitarna', aliases: ['VTN'], lat: 19.5126, lng: 72.8252 },
  { code: 'SAH', name: 'Saphale', aliases: ['SAH'], lat: 19.5784, lng: 72.8211 },
  { code: 'KLV', name: 'Kelve Road', aliases: ['KLV'], lat: 19.6241, lng: 72.7938 },
  { code: 'PLG', name: 'Palghar', aliases: ['PLG'], lat: 19.6974, lng: 72.7663 },
  { code: 'UOI', name: 'Umroli', aliases: ['UOI'], lat: 19.7561, lng: 72.7483 },
  { code: 'BOR', name: 'Boisar', aliases: ['BOR'], lat: 19.8035, lng: 72.7562 },
  { code: 'VGN', name: 'Vangaon', aliases: ['VGN'], lat: 19.8821, lng: 72.7412 },
  { code: 'DRD', name: 'Dahanu Road', aliases: ['DRD', 'Dahanu'], lat: 19.9723, lng: 72.7324 },
];

export class WesternRailwayNormalizer {
  static getStations(): Station[] {
    return WR_OFFICIAL_STATIONS_DATA.map((s) => ({
      id: `stn_${s.code.toLowerCase()}`,
      station_code: s.code,
      station_name: s.name,
      normalized_name: s.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      aliases: s.aliases,
      latitude: s.lat,
      longitude: s.lng,
      zone: 'WR',
      status: 'ACTIVE',
    }));
  }

  static getLine(): Line {
    return {
      id: 'line_wr_suburban',
      railway_id: 'railway_wr',
      code: 'WR_SUBURBAN',
      name: 'Western Line',
      color: '#DC2626', // Western Railway Official Red
      order_seq: 1,
    };
  }
}

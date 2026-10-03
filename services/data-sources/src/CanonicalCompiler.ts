import fs from 'node:fs';
import path from 'node:path';
import {
  CanonicalDataset,
  Railway,
  Division,
  Line,
  Station,
  Route,
  Train,
  TrainStop,
} from '@mumbai-timetable/types';
import { WesternRailwayNormalizer, WesternRailwayParser } from './western-railway/index.js';
import { CentralRailwayNormalizer, CentralRailwayParser } from './central-railway/index.js';
import { computeSha256 } from '@mumbai-timetable/shared';

export class CanonicalCompiler {
  /**
   * Compiles Western Railway and Central Railway sources into a single,
   * fully-deduplicated, normalized Canonical Timetable Dataset.
   */
  static compile(version: string, effectiveDate: string = '2026-09-01'): CanonicalDataset {
    // 1. Railways
    const railways: Railway[] = [
      { id: 'railway_wr', code: 'WR', name: 'Western Railway', zone: 'Western' },
      { id: 'railway_cr', code: 'CR', name: 'Central Railway', zone: 'Central' },
    ];

    // 2. Divisions
    const divisions: Division[] = [
      { id: 'div_bct', railway_id: 'railway_wr', code: 'BCT', name: 'Mumbai Central' },
      { id: 'div_bb', railway_id: 'railway_cr', code: 'BB', name: 'Mumbai CSMT' },
    ];

    // 3. Lines
    const lines: Line[] = [
      WesternRailwayNormalizer.getLine(),
      ...CentralRailwayNormalizer.getLines(),
    ];

    // 4. Stations with cross-zone deduplication (Dadar, etc.)
    const wrStations = WesternRailwayNormalizer.getStations();
    const crStations = CentralRailwayNormalizer.getStations();

    const stationMap = new Map<string, Station>();

    // Add WR stations
    for (const stn of wrStations) {
      stationMap.set(stn.station_code, stn);
    }

    // Merge CR stations (if Dadar or common station exists, augment aliases and keep single canonical record)
    for (const stn of crStations) {
      if (stationMap.has(stn.station_code)) {
        const existing = stationMap.get(stn.station_code)!;
        const mergedAliases = Array.from(new Set([...existing.aliases, ...stn.aliases]));
        existing.aliases = mergedAliases;
      } else {
        stationMap.set(stn.station_code, stn);
      }
    }

    const stations = Array.from(stationMap.values());

    // 5. Check if official compiled dataset exists in storage
    try {
      const storageDatasetPath = path.resolve(process.cwd(), 'storage/google-drive-mock/current/dataset.json');
      if (fs.existsSync(storageDatasetPath)) {
        const fileContent = fs.readFileSync(storageDatasetPath, 'utf8');
        const parsed = JSON.parse(fileContent) as CanonicalDataset;
        if (parsed.trains && parsed.trains.length > 50) {
          return {
            ...parsed,
            version,
            effectiveDate,
          };
        }
      }
    } catch {
      // fallback to dynamic generator below
    }

    // 6. Dynamic seed parser fallback
    const wrData = WesternRailwayParser.parseOfficialServices(stations);
    const crData = CentralRailwayParser.parseOfficialServices(stations);

    const routes: Route[] = [...wrData.routes, ...crData.routes];
    const trains: Train[] = [...wrData.trains, ...crData.trains];
    const train_stops: TrainStop[] = [...wrData.train_stops, ...crData.train_stops];

    const datasetWithoutHash: Omit<CanonicalDataset, 'datasetChecksum'> = {
      version,
      effectiveDate,
      source: 'Official Indian Railways (WR & CR Suburban Timetables)',
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      railways,
      divisions,
      lines,
      routes,
      stations,
      trains,
      train_stops,
    };

    const datasetChecksum = computeSha256(datasetWithoutHash);

    return {
      ...datasetWithoutHash,
      datasetChecksum,
    };
  }
}


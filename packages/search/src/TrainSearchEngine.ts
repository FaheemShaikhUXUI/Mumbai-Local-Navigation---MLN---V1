import {
  Train,
  TrainStop,
  Line,
  Route,
  Station,
  TrainSearchResult,
  TrainRouteDetails,
  TrainRouteStopDetails,
} from '@mumbai-timetable/types';
import { SqliteAdapter } from '@mumbai-timetable/database';
import { timeToSeconds } from '@mumbai-timetable/validation';

export interface TrainSearchFilter {
  trainType?: 'ALL' | 'SLOW' | 'FAST' | 'AC';
  lineId?: string;
  afterTime?: string; // HH:MM:SS
  dayPattern?: string;
}

export class TrainSearchEngine {
  private adapter: SqliteAdapter;

  constructor(adapter: SqliteAdapter) {
    this.adapter = adapter;
  }

  /**
   * Primary From -> To Train Search (Section 24)
   * 1. Finds trains stopping at both From station and To station.
   * 2. Validates sequence (To sequence > From sequence).
   * 3. Calculates departure, arrival, duration in minutes, and stops count.
   * 4. Enriches with Line, Route, and Station metadata.
   * 5. Sorts by departure time.
   */
  async findTrainsBetweenStations(
    fromStationId: string,
    toStationId: string,
    filter: TrainSearchFilter = {}
  ): Promise<TrainSearchResult[]> {
    if (!fromStationId || !toStationId || fromStationId === toStationId) {
      return [];
    }

    // 1. Fetch all stops for fromStationId
    const fromStops = await this.adapter.query<TrainStop>(
      'SELECT * FROM train_stops WHERE station_id = ?',
      [fromStationId]
    );
    if (fromStops.length === 0) return [];

    const fromStopsByTrain = new Map<string, TrainStop>();
    for (const fs of fromStops) {
      fromStopsByTrain.set(fs.train_id, fs);
    }

    // 2. Fetch all stops for toStationId
    const toStops = await this.adapter.query<TrainStop>(
      'SELECT * FROM train_stops WHERE station_id = ?',
      [toStationId]
    );
    if (toStops.length === 0) return [];

    // 3. Match trains serving both stations with correct sequence
    const candidateTrainMatches: Array<{ fromStop: TrainStop; toStop: TrainStop }> = [];
    for (const ts of toStops) {
      const fs = fromStopsByTrain.get(ts.train_id);
      if (fs && ts.sequence > fs.sequence) {
        candidateTrainMatches.push({ fromStop: fs, toStop: ts });
      }
    }

    if (candidateTrainMatches.length === 0) return [];

    // 4. Load metadata maps
    const lines = await this.adapter.query<Line>('SELECT * FROM lines');
    const lineMap = new Map<string, Line>(lines.map((l) => [l.id, l]));

    const routes = await this.adapter.query<Route>('SELECT * FROM routes');
    const routeMap = new Map<string, Route>(routes.map((r) => [r.id, r]));

    const stations = await this.adapter.query<Station>('SELECT * FROM stations');
    const stationMap = new Map<string, Station>(stations.map((s) => [s.id, s]));

    const results: TrainSearchResult[] = [];

    // 5. Build detailed result cards
    for (const match of candidateTrainMatches) {
      const train = await this.adapter.queryOne<Train>(
        'SELECT * FROM trains WHERE id = ?',
        [match.fromStop.train_id]
      );
      if (!train || train.status !== 'ACTIVE') continue;

      // Apply line filter if requested
      if (filter.lineId && train.line_id !== filter.lineId) continue;

      // Apply train type filter
      if (filter.trainType && filter.trainType !== 'ALL') {
        if (filter.trainType === 'AC' && !train.train_type.startsWith('AC')) continue;
        if (filter.trainType === 'FAST' && !train.train_type.includes('FAST')) continue;
        if (filter.trainType === 'SLOW' && !train.train_type.includes('SLOW')) continue;
      }

      // Apply time filter
      if (filter.afterTime) {
        const depSec = timeToSeconds(match.fromStop.departure_time);
        const afterSec = timeToSeconds(filter.afterTime);
        if (depSec < afterSec) continue;
      }

      const depSec = timeToSeconds(match.fromStop.departure_time);
      let arrSec = timeToSeconds(match.toStop.arrival_time);
      if (arrSec < depSec) {
        // Roll-over across midnight
        arrSec += 24 * 3600;
      }
      const durationMinutes = Math.round((arrSec - depSec) / 60);
      const stopsCount = match.toStop.sequence - match.fromStop.sequence;

      const line = lineMap.get(train.line_id) || {
        id: train.line_id,
        railway_id: '',
        code: 'UNKNOWN',
        name: 'Suburban Line',
        color: '#2563EB',
        order_seq: 1,
      };

      const route = routeMap.get(train.route_id) || {
        id: train.route_id,
        line_id: train.line_id,
        name: 'Direct Route',
        direction: 'DN',
        origin_station_id: train.origin_station_id,
        destination_station_id: train.destination_station_id,
      };

      results.push({
        train,
        fromStop: match.fromStop,
        toStop: match.toStop,
        departureTime: match.fromStop.departure_time,
        arrivalTime: match.toStop.arrival_time,
        durationMinutes,
        stopsCount,
        line,
        route,
        originStation: stationMap.get(train.origin_station_id) || {
          id: train.origin_station_id,
          station_code: '',
          station_name: 'Origin',
          normalized_name: 'origin',
          aliases: [],
          status: 'ACTIVE',
        },
        destinationStation: stationMap.get(train.destination_station_id) || {
          id: train.destination_station_id,
          station_code: '',
          station_name: 'Destination',
          normalized_name: 'destination',
          aliases: [],
          status: 'ACTIVE',
        },
      });
    }

    // 6. Sort results by departure time ascending
    results.sort((a, b) => {
      const aSec = timeToSeconds(a.departureTime);
      const bSec = timeToSeconds(b.departureTime);
      return aSec - bSec;
    });

    return results;
  }

  /**
   * Retrieves complete station-by-station route details for a train (Section 26).
   */
  async getTrainRouteDetails(trainId: string): Promise<TrainRouteDetails | null> {
    const train = await this.adapter.queryOne<Train>(
      'SELECT * FROM trains WHERE id = ?',
      [trainId]
    );
    if (!train) return null;

    const stops = await this.adapter.query<TrainStop>(
      'SELECT * FROM train_stops WHERE train_id = ? ORDER BY sequence ASC',
      [trainId]
    );

    const line = await this.adapter.queryOne<Line>(
      'SELECT * FROM lines WHERE id = ?',
      [train.line_id]
    );
    const route = await this.adapter.queryOne<Route>(
      'SELECT * FROM routes WHERE id = ?',
      [train.route_id]
    );

    const stations = await this.adapter.query<Station>('SELECT * FROM stations');
    const stationMap = new Map<string, Station>(stations.map((s) => [s.id, s]));

    const enrichedStops: TrainRouteStopDetails[] = stops.map((stop) => {
      const station = stationMap.get(stop.station_id);
      return {
        ...stop,
        stationName: station ? station.station_name : 'Unknown Station',
        stationCode: station ? station.station_code : '',
        isOrigin: stop.station_id === train.origin_station_id,
        isDestination: stop.station_id === train.destination_station_id,
      };
    });

    return {
      train,
      line: line || {
        id: train.line_id,
        railway_id: '',
        code: 'LINE',
        name: 'Suburban Line',
        color: '#2563EB',
        order_seq: 1,
      },
      route: route || {
        id: train.route_id,
        line_id: train.line_id,
        name: 'Route',
        direction: 'DN',
        origin_station_id: train.origin_station_id,
        destination_station_id: train.destination_station_id,
      },
      originStation: stationMap.get(train.origin_station_id) || {
        id: train.origin_station_id,
        station_code: '',
        station_name: 'Origin',
        normalized_name: 'origin',
        aliases: [],
        status: 'ACTIVE',
      },
      destinationStation: stationMap.get(train.destination_station_id) || {
        id: train.destination_station_id,
        station_code: '',
        station_name: 'Destination',
        normalized_name: 'destination',
        aliases: [],
        status: 'ACTIVE',
      },
      stops: enrichedStops,
    };
  }
}

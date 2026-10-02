import { Line, Station, Route } from '@mumbai-timetable/types';
import { SqliteAdapter } from '@mumbai-timetable/database';

export interface LineWithStations {
  line: Line;
  stations: Station[];
  routes: Route[];
  totalTrainsCount: number;
}

export class LineExplorer {
  private adapter: SqliteAdapter;

  constructor(adapter: SqliteAdapter) {
    this.adapter = adapter;
  }

  /**
   * Returns all suburban lines ordered by sequence.
   */
  async getAllLines(): Promise<Line[]> {
    return this.adapter.query<Line>('SELECT * FROM lines ORDER BY order_seq ASC');
  }

  /**
   * Retrieves line details including all unique stations served along its routes.
   * Stations are deduplicated: shared interchange stations (Dadar, Kurla, Thane, Kalyan, etc.)
   * preserve their single canonical identity.
   */
  async getLineWithStations(lineId: string): Promise<LineWithStations | null> {
    const line = await this.adapter.queryOne<Line>(
      'SELECT * FROM lines WHERE id = ?',
      [lineId]
    );
    if (!line) return null;

    const routes = await this.adapter.query<Route>(
      'SELECT * FROM routes WHERE line_id = ?',
      [lineId]
    );

    // Find all distinct station_ids served by trains on this line
    const trainsOnLine = await this.adapter.query<{ id: string }>(
      'SELECT id FROM trains WHERE line_id = ?',
      [lineId]
    );
    const trainIds = trainsOnLine.map((t) => t.id);

    const stationIdSet = new Set<string>();
    // Add origin and destinations of all routes on line
    routes.forEach((r) => {
      stationIdSet.add(r.origin_station_id);
      stationIdSet.add(r.destination_station_id);
    });

    // Add stations from all train stops on this line
    for (const tId of trainIds) {
      const stops = await this.adapter.query<{ station_id: string }>(
        'SELECT station_id FROM train_stops WHERE train_id = ?',
        [tId]
      );
      stops.forEach((s) => stationIdSet.add(s.station_id));
    }

    const allStations = await this.adapter.query<Station>('SELECT * FROM stations');
    const lineStations = allStations.filter((s) => stationIdSet.has(s.id));

    // Order stations geographically or along the primary route
    return {
      line,
      stations: lineStations,
      routes,
      totalTrainsCount: trainIds.length,
    };
  }

  /**
   * Returns all lines serving a specific station (interchange support).
   */
  async getLinesServingStation(stationId: string): Promise<Line[]> {
    const stops = await this.adapter.query<{ train_id: string }>(
      'SELECT DISTINCT train_id FROM train_stops WHERE station_id = ?',
      [stationId]
    );
    const trainIds = stops.map((s) => s.train_id);
    if (trainIds.length === 0) return [];

    const lineIdSet = new Set<string>();
    for (const tId of trainIds) {
      const train = await this.adapter.queryOne<{ line_id: string }>(
        'SELECT line_id FROM trains WHERE id = ?',
        [tId]
      );
      if (train) lineIdSet.add(train.line_id);
    }

    const lines = await this.adapter.query<Line>('SELECT * FROM lines');
    return lines.filter((l) => lineIdSet.has(l.id));
  }
}

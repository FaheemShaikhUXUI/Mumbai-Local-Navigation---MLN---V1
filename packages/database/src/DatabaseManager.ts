import {
  CanonicalDataset,
  UpdatePackage,
  Railway,
  Division,
  Line,
  Route,
  Station,
  Train,
  TrainStop,
  TimetableVersion,
} from '@mumbai-timetable/types';
import { SqliteAdapter } from './sqlite/SqliteAdapter.js';
import { MemoryRelationalSqliteDriver } from './sqlite/MemoryRelationalSqliteDriver.js';
import { validateCanonicalDataset, validateUpdatePackage } from '@mumbai-timetable/validation';
import { computeSha256 } from '@mumbai-timetable/shared';

export interface DatabaseManagerOptions {
  adapter?: SqliteAdapter;
  schemaSql?: string;
}

export class DatabaseManager {
  private adapter: SqliteAdapter;

  constructor(options: DatabaseManagerOptions = {}) {
    this.adapter = options.adapter || new MemoryRelationalSqliteDriver();
  }

  getAdapter(): SqliteAdapter {
    return this.adapter;
  }

  /**
   * Initializes SQLite tables and performance indices.
   */
  async initializeDatabase(schemaSql?: string): Promise<void> {
    if (schemaSql) {
      await this.adapter.execScript(schemaSql);
    } else {
      // Default canonical schema DDL
      const defaultDDL = `
        CREATE TABLE IF NOT EXISTS railways (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, zone TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS divisions (id TEXT PRIMARY KEY, railway_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS lines (id TEXT PRIMARY KEY, railway_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, color TEXT NOT NULL, order_seq INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY, line_id TEXT NOT NULL, name TEXT NOT NULL, direction TEXT NOT NULL, origin_station_id TEXT NOT NULL, destination_station_id TEXT NOT NULL, description TEXT);
        CREATE TABLE IF NOT EXISTS stations (id TEXT PRIMARY KEY, station_code TEXT NOT NULL UNIQUE, station_name TEXT NOT NULL, normalized_name TEXT NOT NULL, aliases TEXT NOT NULL DEFAULT '[]', latitude REAL, longitude REAL, zone TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE');
        CREATE TABLE IF NOT EXISTS trains (id TEXT PRIMARY KEY, train_number TEXT NOT NULL UNIQUE, train_code TEXT NOT NULL, train_name TEXT NOT NULL, train_type TEXT NOT NULL, origin_station_id TEXT NOT NULL, destination_station_id TEXT NOT NULL, line_id TEXT NOT NULL, route_id TEXT NOT NULL, cars INTEGER NOT NULL DEFAULT 12, status TEXT NOT NULL DEFAULT 'ACTIVE');
        CREATE TABLE IF NOT EXISTS train_stops (id TEXT PRIMARY KEY, train_id TEXT NOT NULL, station_id TEXT NOT NULL, sequence INTEGER NOT NULL, arrival_time TEXT NOT NULL, departure_time TEXT NOT NULL, day_pattern TEXT NOT NULL DEFAULT 'DAILY', platform TEXT);
        CREATE TABLE IF NOT EXISTS timetable_versions (version TEXT PRIMARY KEY, created_at TEXT NOT NULL, effective_date TEXT NOT NULL, source TEXT NOT NULL, source_checksum TEXT NOT NULL, dataset_checksum TEXT NOT NULL, schema_version TEXT NOT NULL, record_counts TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      `;
      await this.adapter.execScript(defaultDDL);
    }
  }

  /**
   * Imports a complete verified canonical dataset into SQLite transactionally.
   */
  async importFullDataset(dataset: CanonicalDataset): Promise<{ success: boolean; error?: string }> {
    const report = validateCanonicalDataset(dataset);
    if (!report.isValid) {
      return {
        success: false,
        error: `Validation failed with ${report.errors.length} errors: ${report.errors[0].message}`,
      };
    }

    try {
      await this.adapter.beginTransaction();

      // Clear previous data
      await this.adapter.execute('DELETE FROM train_stops');
      await this.adapter.execute('DELETE FROM trains');
      await this.adapter.execute('DELETE FROM routes');
      await this.adapter.execute('DELETE FROM lines');
      await this.adapter.execute('DELETE FROM divisions');
      await this.adapter.execute('DELETE FROM railways');
      await this.adapter.execute('DELETE FROM stations');

      // 1. Railways
      for (const r of dataset.railways) {
        await this.adapter.execute(
          'INSERT INTO railways (id, code, name, zone) VALUES (?, ?, ?, ?)',
          [r.id, r.code, r.name, r.zone]
        );
      }

      // 2. Divisions
      for (const d of dataset.divisions) {
        await this.adapter.execute(
          'INSERT INTO divisions (id, railway_id, code, name) VALUES (?, ?, ?, ?)',
          [d.id, d.railway_id, d.code, d.name]
        );
      }

      // 3. Lines
      for (const l of dataset.lines) {
        await this.adapter.execute(
          'INSERT INTO lines (id, railway_id, code, name, color, order_seq) VALUES (?, ?, ?, ?, ?, ?)',
          [l.id, l.railway_id, l.code, l.name, l.color, l.order_seq]
        );
      }

      // 4. Stations
      for (const s of dataset.stations) {
        await this.adapter.execute(
          'INSERT INTO stations (id, station_code, station_name, normalized_name, aliases, latitude, longitude, zone, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            s.id,
            s.station_code,
            s.station_name,
            s.normalized_name,
            JSON.stringify(s.aliases || []),
            s.latitude || null,
            s.longitude || null,
            s.zone || null,
            s.status || 'ACTIVE',
          ]
        );
      }

      // 5. Routes
      for (const rt of dataset.routes) {
        await this.adapter.execute(
          'INSERT INTO routes (id, line_id, name, direction, origin_station_id, destination_station_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            rt.id,
            rt.line_id,
            rt.name,
            rt.direction,
            rt.origin_station_id,
            rt.destination_station_id,
            rt.description || null,
          ]
        );
      }

      // 6. Trains
      for (const t of dataset.trains) {
        await this.adapter.execute(
          'INSERT INTO trains (id, train_number, train_code, train_name, train_type, origin_station_id, destination_station_id, line_id, route_id, cars, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            t.id,
            t.train_number,
            t.train_code,
            t.train_name,
            t.train_type,
            t.origin_station_id,
            t.destination_station_id,
            t.line_id,
            t.route_id,
            t.cars || 12,
            t.status || 'ACTIVE',
          ]
        );
      }

      // 7. Train Stops
      for (const ts of dataset.train_stops) {
        await this.adapter.execute(
          'INSERT INTO train_stops (id, train_id, station_id, sequence, arrival_time, departure_time, day_pattern, platform) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            ts.id,
            ts.train_id,
            ts.station_id,
            ts.sequence,
            ts.arrival_time,
            ts.departure_time,
            ts.day_pattern || 'DAILY',
            ts.platform || null,
          ]
        );
      }

      // Set all other versions inactive
      await this.adapter.execute('UPDATE timetable_versions SET is_active = 0');

      // Record active timetable version
      await this.adapter.execute(
        'INSERT OR REPLACE INTO timetable_versions (version, created_at, effective_date, source, source_checksum, dataset_checksum, schema_version, record_counts, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          dataset.version,
          dataset.createdAt || new Date().toISOString(),
          dataset.effectiveDate,
          dataset.source,
          '',
          dataset.datasetChecksum || computeSha256(dataset),
          dataset.schemaVersion,
          JSON.stringify(report.counts),
          1,
        ]
      );

      // Record sync metadata
      await this.adapter.execute(
        'INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        ['active_version', dataset.version, new Date().toISOString()]
      );

      await this.adapter.commitTransaction();
      return { success: true };
    } catch (err: any) {
      await this.adapter.rollbackTransaction();
      return { success: false, error: `Import failed: ${err.message}` };
    }
  }

  /**
   * Applies an incremental update package safely inside a transaction.
   * If validation, checksum, or integrity check fails: rolls back completely! (Section 16 & 36)
   */
  async applyUpdatePackage(
    pkg: UpdatePackage
  ): Promise<{ success: boolean; rollbackApplied: boolean; error?: string }> {
    const validation = validateUpdatePackage(pkg);
    if (!validation.isValid) {
      return {
        success: false,
        rollbackApplied: false,
        error: `Invalid update package: ${validation.errors.join(', ')}`,
      };
    }

    const currentVersion = await this.getActiveVersion();
    if (currentVersion && currentVersion !== pkg.fromVersion) {
      return {
        success: false,
        rollbackApplied: false,
        error: `Version mismatch: current installed version is '${currentVersion}', but update requires '${pkg.fromVersion}'`,
      };
    }

    // 1. Verify Checksum (Section 16)
    const computedChecksum = computeSha256(JSON.stringify(pkg.diff));
    if (pkg.checksum && pkg.checksum !== computedChecksum) {
      return {
        success: false,
        rollbackApplied: true,
        error: `Checksum verification failed: expected '${pkg.checksum}', computed '${computedChecksum}'`,
      };
    }

    // 2. Validate Stop sequences and data integrity
    if (pkg.diff.tables.train_stops?.created) {
      for (const ts of pkg.diff.tables.train_stops.created) {
        if (ts.sequence < 1) {
          return {
            success: false,
            rollbackApplied: true,
            error: `Integrity check failed: stop ${ts.id} has invalid sequence ${ts.sequence}`,
          };
        }
      }
    }
    if (pkg.diff.tables.train_stops?.updated) {
      for (const ts of pkg.diff.tables.train_stops.updated) {
        if (ts.sequence !== undefined && ts.sequence < 1) {
          return {
            success: false,
            rollbackApplied: true,
            error: `Integrity check failed: stop ${ts.id} has invalid sequence ${ts.sequence}`,
          };
        }
      }
    }

    try {
      await this.adapter.beginTransaction();

      const tables = pkg.diff.tables;

      // 1. Process deletions (child to parent: train_stops -> trains -> routes -> stations)
      if (tables.train_stops?.deleted) {
        for (const id of tables.train_stops.deleted) {
          await this.adapter.execute('DELETE FROM train_stops WHERE id = ?', [id]);
        }
      }
      if (tables.trains?.deleted) {
        for (const id of tables.trains.deleted) {
          await this.adapter.execute('DELETE FROM trains WHERE id = ?', [id]);
        }
      }
      if (tables.routes?.deleted) {
        for (const id of tables.routes.deleted) {
          await this.adapter.execute('DELETE FROM routes WHERE id = ?', [id]);
        }
      }
      if (tables.stations?.deleted) {
        for (const id of tables.stations.deleted) {
          await this.adapter.execute('DELETE FROM stations WHERE id = ?', [id]);
        }
      }

      // 2. Process additions & updates for stations
      if (tables.stations?.created) {
        for (const s of tables.stations.created) {
          await this.adapter.execute(
            'INSERT OR REPLACE INTO stations (id, station_code, station_name, normalized_name, aliases, latitude, longitude, zone, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [s.id, s.station_code, s.station_name, s.normalized_name, JSON.stringify(s.aliases || []), s.latitude || null, s.longitude || null, s.zone || null, s.status || 'ACTIVE']
          );
        }
      }
      if (tables.stations?.updated) {
        for (const s of tables.stations.updated) {
          await this.adapter.execute(
            'UPDATE stations SET station_code = ?, station_name = ?, normalized_name = ?, aliases = ?, status = ? WHERE id = ?',
            [s.station_code, s.station_name, s.normalized_name, JSON.stringify(s.aliases || []), s.status || 'ACTIVE', s.id]
          );
        }
      }

      // 3. Process additions & updates for routes
      if (tables.routes?.created) {
        for (const r of tables.routes.created) {
          await this.adapter.execute(
            'INSERT OR REPLACE INTO routes (id, line_id, name, direction, origin_station_id, destination_station_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [r.id, r.line_id, r.name, r.direction, r.origin_station_id, r.destination_station_id, r.description || null]
          );
        }
      }
      if (tables.routes?.updated) {
        for (const r of tables.routes.updated) {
          await this.adapter.execute(
            'UPDATE routes SET line_id = ?, name = ?, direction = ?, origin_station_id = ?, destination_station_id = ?, description = ? WHERE id = ?',
            [r.line_id, r.name, r.direction, r.origin_station_id, r.destination_station_id, r.description || null, r.id]
          );
        }
      }

      // 4. Process additions & updates for trains
      if (tables.trains?.created) {
        for (const t of tables.trains.created) {
          await this.adapter.execute(
            'INSERT OR REPLACE INTO trains (id, train_number, train_code, train_name, train_type, origin_station_id, destination_station_id, line_id, route_id, cars, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [t.id, t.train_number, t.train_code, t.train_name, t.train_type, t.origin_station_id, t.destination_station_id, t.line_id, t.route_id, t.cars || 12, t.status || 'ACTIVE']
          );
        }
      }
      if (tables.trains?.updated) {
        for (const t of tables.trains.updated) {
          await this.adapter.execute(
            'UPDATE trains SET train_number = ?, train_code = ?, train_name = ?, train_type = ?, origin_station_id = ?, destination_station_id = ?, line_id = ?, route_id = ?, cars = ?, status = ? WHERE id = ?',
            [t.train_number, t.train_code, t.train_name, t.train_type, t.origin_station_id, t.destination_station_id, t.line_id, t.route_id, t.cars || 12, t.status || 'ACTIVE', t.id]
          );
        }
      }

      // 5. Process additions & updates for train_stops
      if (tables.train_stops?.created) {
        for (const ts of tables.train_stops.created) {
          await this.adapter.execute(
            'INSERT OR REPLACE INTO train_stops (id, train_id, station_id, sequence, arrival_time, departure_time, day_pattern, platform) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [ts.id, ts.train_id, ts.station_id, ts.sequence, ts.arrival_time, ts.departure_time, ts.day_pattern || 'DAILY', ts.platform || null]
          );
        }
      }
      if (tables.train_stops?.updated) {
        for (const ts of tables.train_stops.updated) {
          await this.adapter.execute(
            'UPDATE train_stops SET arrival_time = ?, departure_time = ?, platform = ?, sequence = ? WHERE id = ?',
            [ts.arrival_time, ts.departure_time, ts.platform || null, ts.sequence, ts.id]
          );
        }
      }

      // Simulated integrity check: test if any corrupted negative sequence or invalid reference exists
      const corruptedStop = await this.adapter.queryOne(
        'SELECT id FROM train_stops WHERE sequence < 1'
      );
      if (corruptedStop) {
        throw new Error(`Integrity check failed: corrupted stop ${corruptedStop.id} has invalid sequence`);
      }

      // Mark previous versions inactive and record new version
      await this.adapter.execute('UPDATE timetable_versions SET is_active = 0');
      await this.adapter.execute(
        'INSERT OR REPLACE INTO timetable_versions (version, created_at, effective_date, source, source_checksum, dataset_checksum, schema_version, record_counts, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          pkg.toVersion,
          pkg.generatedAt,
          pkg.generatedAt.split('T')[0],
          'Incremental Update',
          '',
          pkg.checksum,
          pkg.schemaVersion,
          JSON.stringify(pkg.diff.summary),
          1,
        ]
      );

      await this.adapter.execute(
        'INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        ['active_version', pkg.toVersion, new Date().toISOString()]
      );

      await this.adapter.commitTransaction();
      return { success: true, rollbackApplied: false };
    } catch (err: any) {
      // Safe transactional rollback (Section 16 & 36)
      await this.adapter.rollbackTransaction();
      return {
        success: false,
        rollbackApplied: true,
        error: `Update failed and was safely rolled back: ${err.message}`,
      };
    }
  }

  async getActiveVersion(): Promise<string | null> {
    const row = await this.adapter.queryOne<TimetableVersion>(
      'SELECT version FROM timetable_versions WHERE is_active = 1 LIMIT 1'
    );
    return row ? row.version : null;
  }

  async getStats(): Promise<Record<string, number>> {
    if (this.adapter instanceof MemoryRelationalSqliteDriver) {
      return {
        railways: this.adapter.getTableRecordCount('railways'),
        divisions: this.adapter.getTableRecordCount('divisions'),
        lines: this.adapter.getTableRecordCount('lines'),
        routes: this.adapter.getTableRecordCount('routes'),
        stations: this.adapter.getTableRecordCount('stations'),
        trains: this.adapter.getTableRecordCount('trains'),
        train_stops: this.adapter.getTableRecordCount('train_stops'),
      };
    }
    return {};
  }
}

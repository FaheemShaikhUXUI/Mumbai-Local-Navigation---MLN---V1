import {
  CanonicalDataset,
  TableDiff,
  TimetableDiff,
  UpdatePackage,
} from '@mumbai-timetable/types';
import { computeSha256, canonicalJsonStringify } from '@mumbai-timetable/shared';

export class DiffEngine {
  /**
   * Computes granular CREATE, UPDATE, DELETE diff between two canonical datasets.
   */
  static computeDiff(oldData: CanonicalDataset, newData: CanonicalDataset): TimetableDiff {
    const railwaysDiff = this.diffTable(oldData.railways || [], newData.railways || [], 'id');
    const divisionsDiff = this.diffTable(oldData.divisions || [], newData.divisions || [], 'id');
    const linesDiff = this.diffTable(oldData.lines || [], newData.lines || [], 'id');
    const routesDiff = this.diffTable(oldData.routes || [], newData.routes || [], 'id');
    const stationsDiff = this.diffTable(oldData.stations || [], newData.stations || [], 'id');
    const trainsDiff = this.diffTable(oldData.trains || [], newData.trains || [], 'id');
    const stopsDiff = this.diffTable(oldData.train_stops || [], newData.train_stops || [], 'id');

    const totalAdded =
      railwaysDiff.created.length +
      divisionsDiff.created.length +
      linesDiff.created.length +
      routesDiff.created.length +
      stationsDiff.created.length +
      trainsDiff.created.length +
      stopsDiff.created.length;

    const totalUpdated =
      railwaysDiff.updated.length +
      divisionsDiff.updated.length +
      linesDiff.updated.length +
      routesDiff.updated.length +
      stationsDiff.updated.length +
      trainsDiff.updated.length +
      stopsDiff.updated.length;

    const totalDeleted =
      railwaysDiff.deleted.length +
      divisionsDiff.deleted.length +
      linesDiff.deleted.length +
      routesDiff.deleted.length +
      stationsDiff.deleted.length +
      trainsDiff.deleted.length +
      stopsDiff.deleted.length;

    return {
      fromVersion: oldData.version,
      toVersion: newData.version,
      generatedAt: new Date().toISOString(),
      schemaVersion: newData.schemaVersion,
      tables: {
        railways: railwaysDiff,
        divisions: divisionsDiff,
        lines: linesDiff,
        routes: routesDiff,
        stations: stationsDiff,
        trains: trainsDiff,
        train_stops: stopsDiff,
      },
      summary: {
        totalAdded,
        totalUpdated,
        totalDeleted,
      },
    };
  }

  /**
   * Compares two lists of records by primary key and content hash.
   */
  private static diffTable<T extends { [key: string]: any }>(
    oldList: T[],
    newList: T[],
    keyProp: string
  ): TableDiff<T> {
    const oldMap = new Map<string, T>();
    const oldHashMap = new Map<string, string>();
    for (const item of oldList) {
      const key = String(item[keyProp]);
      oldMap.set(key, item);
      oldHashMap.set(key, computeSha256(canonicalJsonStringify(item)));
    }

    const newMap = new Map<string, T>();
    const created: T[] = [];
    const updated: T[] = [];

    for (const item of newList) {
      const key = String(item[keyProp]);
      newMap.set(key, item);
      const newHash = computeSha256(canonicalJsonStringify(item));

      if (!oldMap.has(key)) {
        created.push(item);
      } else {
        const oldHash = oldHashMap.get(key);
        if (oldHash !== newHash) {
          updated.push(item);
        }
      }
    }

    const deleted: string[] = [];
    for (const key of oldMap.keys()) {
      if (!newMap.has(key)) {
        deleted.push(key);
      }
    }

    return {
      created,
      updated,
      deleted,
    };
  }

  /**
   * Packages diff into an UpdatePackage with cryptographic checksum.
   */
  static createUpdatePackage(oldData: CanonicalDataset, newData: CanonicalDataset): UpdatePackage {
    const diff = this.computeDiff(oldData, newData);
    const serializedDiff = JSON.stringify(diff);
    const checksum = computeSha256(serializedDiff);

    return {
      fromVersion: oldData.version,
      toVersion: newData.version,
      schemaVersion: newData.schemaVersion,
      generatedAt: diff.generatedAt,
      checksum,
      diff,
      sizeBytes: Buffer.byteLength(serializedDiff, 'utf8'),
    };
  }
}

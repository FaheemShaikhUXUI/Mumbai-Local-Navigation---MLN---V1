import {
  CanonicalDataset,
  Station,
  Train,
  TrainStop,
  ValidationError,
  ValidationReport,
  UpdatePackage,
} from '@mumbai-timetable/types';

/**
 * Converts HH:MM:SS or HH:MM to seconds since midnight for accurate time arithmetic.
 */
export function timeToSeconds(timeStr: string): number {
  if (!timeStr) return -1;
  const parts = timeStr.trim().split(':').map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.some(isNaN)) return -1;
  const hours = parts[0];
  const minutes = parts[1];
  const seconds = parts[2] || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Validates a full Canonical Timetable Dataset before publishing.
 * Enforces all strict railway data rules from Section 20 of specification.
 */
export function validateCanonicalDataset(dataset: CanonicalDataset): ValidationReport {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Basic Metadata validation
  if (!dataset.version || !/^\d{4}\.\d{2}\.\d{2}\.\d{3}$/.test(dataset.version)) {
    errors.push({
      entity: 'dataset',
      field: 'version',
      message: `Invalid version format '${dataset.version}'. Expected deterministic format YYYY.MM.DD.NNN`,
      critical: true,
    });
  }

  if (!dataset.schemaVersion) {
    errors.push({
      entity: 'dataset',
      field: 'schemaVersion',
      message: 'Missing schemaVersion',
      critical: true,
    });
  }

  // 2. Station validation & indexing
  const stationIdSet = new Set<string>();
  const stationCodeMap = new Map<string, string>();
  const stationNormalizedMap = new Map<string, string>();

  if (!dataset.stations || dataset.stations.length === 0) {
    errors.push({
      entity: 'stations',
      message: 'Dataset contains zero stations. Minimum suburban network required.',
      critical: true,
    });
  } else {
    for (const station of dataset.stations) {
      if (!station.id) {
        errors.push({
          entity: 'stations',
          message: 'Station missing ID',
          critical: true,
        });
        continue;
      }

      if (stationIdSet.has(station.id)) {
        errors.push({
          entity: 'stations',
          id: station.id,
          message: `Duplicate station ID: '${station.id}'`,
          critical: true,
        });
      }
      stationIdSet.add(station.id);

      if (!station.station_code || station.station_code.trim().length === 0) {
        errors.push({
          entity: 'stations',
          id: station.id,
          field: 'station_code',
          message: `Station '${station.station_name}' is missing station_code`,
          critical: true,
        });
      } else {
        const code = station.station_code.trim().toUpperCase();
        if (stationCodeMap.has(code)) {
          errors.push({
            entity: 'stations',
            id: station.id,
            field: 'station_code',
            message: `Duplicate station code '${code}' shared by '${station.id}' and '${stationCodeMap.get(code)}'`,
            critical: true,
          });
        } else {
          stationCodeMap.set(code, station.id);
        }
      }

      if (!station.station_name || station.station_name.trim().length === 0) {
        errors.push({
          entity: 'stations',
          id: station.id,
          field: 'station_name',
          message: `Station ID '${station.id}' has empty station_name`,
          critical: true,
        });
      }

      if (station.normalized_name) {
        const norm = station.normalized_name.toLowerCase();
        if (stationNormalizedMap.has(norm)) {
          warnings.push({
            entity: 'stations',
            id: station.id,
            field: 'normalized_name',
            message: `Possible duplicate station normalized name '${norm}' shared by '${station.id}' and '${stationNormalizedMap.get(norm)}'`,
            critical: false,
          });
        } else {
          stationNormalizedMap.set(norm, station.id);
        }
      }
    }
  }

  // 3. Lines & Routes validation
  const lineIdSet = new Set<string>(dataset.lines.map((l) => l.id));
  const routeIdSet = new Set<string>();

  for (const route of dataset.routes) {
    if (routeIdSet.has(route.id)) {
      errors.push({
        entity: 'routes',
        id: route.id,
        message: `Duplicate route ID '${route.id}'`,
        critical: true,
      });
    }
    routeIdSet.add(route.id);

    if (!lineIdSet.has(route.line_id)) {
      errors.push({
        entity: 'routes',
        id: route.id,
        field: 'line_id',
        message: `Route '${route.id}' references non-existent line '${route.line_id}'`,
        critical: true,
      });
    }

    if (!stationIdSet.has(route.origin_station_id)) {
      errors.push({
        entity: 'routes',
        id: route.id,
        field: 'origin_station_id',
        message: `Route '${route.id}' references non-existent origin station '${route.origin_station_id}'`,
        critical: true,
      });
    }

    if (!stationIdSet.has(route.destination_station_id)) {
      errors.push({
        entity: 'routes',
        id: route.id,
        field: 'destination_station_id',
        message: `Route '${route.id}' references non-existent destination station '${route.destination_station_id}'`,
        critical: true,
      });
    }
  }

  // 4. Trains validation
  const trainIdSet = new Set<string>();
  const trainNumberMap = new Map<string, string>();

  if (!dataset.trains || dataset.trains.length === 0) {
    errors.push({
      entity: 'trains',
      message: 'Dataset contains zero trains.',
      critical: true,
    });
  } else {
    for (const train of dataset.trains) {
      if (trainIdSet.has(train.id)) {
        errors.push({
          entity: 'trains',
          id: train.id,
          message: `Duplicate train ID '${train.id}'`,
          critical: true,
        });
      }
      trainIdSet.add(train.id);

      if (!train.train_number || train.train_number.trim().length === 0) {
        errors.push({
          entity: 'trains',
          id: train.id,
          field: 'train_number',
          message: `Train '${train.id}' missing train_number`,
          critical: true,
        });
      } else {
        const num = train.train_number.trim();
        if (trainNumberMap.has(num)) {
          errors.push({
            entity: 'trains',
            id: train.id,
            field: 'train_number',
            message: `Duplicate train number '${num}' used by trains '${train.id}' and '${trainNumberMap.get(num)}'`,
            critical: true,
          });
        } else {
          trainNumberMap.set(num, train.id);
        }
      }

      if (!stationIdSet.has(train.origin_station_id)) {
        errors.push({
          entity: 'trains',
          id: train.id,
          field: 'origin_station_id',
          message: `Train '${train.id}' references non-existent origin station '${train.origin_station_id}'`,
          critical: true,
        });
      }

      if (!stationIdSet.has(train.destination_station_id)) {
        errors.push({
          entity: 'trains',
          id: train.id,
          field: 'destination_station_id',
          message: `Train '${train.id}' references non-existent destination station '${train.destination_station_id}'`,
          critical: true,
        });
      }

      if (train.origin_station_id === train.destination_station_id) {
        errors.push({
          entity: 'trains',
          id: train.id,
          message: `Train '${train.id}' origin and destination stations are identical ('${train.origin_station_id}')`,
          critical: true,
        });
      }

      if (!lineIdSet.has(train.line_id)) {
        errors.push({
          entity: 'trains',
          id: train.id,
          field: 'line_id',
          message: `Train '${train.id}' references non-existent line '${train.line_id}'`,
          critical: true,
        });
      }
    }
  }

  // 5. Train Stops validation
  const stopsByTrain = new Map<string, TrainStop[]>();
  for (const stop of dataset.train_stops) {
    if (!stopsByTrain.has(stop.train_id)) {
      stopsByTrain.set(stop.train_id, []);
    }
    stopsByTrain.get(stop.train_id)!.push(stop);

    if (!stationIdSet.has(stop.station_id)) {
      errors.push({
        entity: 'train_stops',
        id: stop.id,
        field: 'station_id',
        message: `Train stop '${stop.id}' references non-existent station '${stop.station_id}'`,
        critical: true,
      });
    }

    if (!trainIdSet.has(stop.train_id)) {
      errors.push({
        entity: 'train_stops',
        id: stop.id,
        field: 'train_id',
        message: `Train stop '${stop.id}' references non-existent train '${stop.train_id}'`,
        critical: true,
      });
    }

    const arrSec = timeToSeconds(stop.arrival_time);
    const depSec = timeToSeconds(stop.departure_time);

    if (arrSec < 0) {
      errors.push({
        entity: 'train_stops',
        id: stop.id,
        field: 'arrival_time',
        message: `Invalid arrival time format '${stop.arrival_time}' on stop '${stop.id}'`,
        critical: true,
      });
    }

    if (depSec < 0) {
      errors.push({
        entity: 'train_stops',
        id: stop.id,
        field: 'departure_time',
        message: `Invalid departure time format '${stop.departure_time}' on stop '${stop.id}'`,
        critical: true,
      });
    }

    if (arrSec >= 0 && depSec >= 0 && depSec < arrSec) {
      // Departure before arrival at same station
      errors.push({
        entity: 'train_stops',
        id: stop.id,
        message: `Departure time '${stop.departure_time}' is earlier than arrival time '${stop.arrival_time}' at stop '${stop.id}'`,
        critical: true,
      });
    }
  }

  // Verify each train has sequenced stops matching origin and destination
  for (const train of dataset.trains) {
    const stops = stopsByTrain.get(train.id) || [];
    if (stops.length < 2) {
      errors.push({
        entity: 'trains',
        id: train.id,
        message: `Train '${train.id}' (${train.train_number}) has fewer than 2 stops (found: ${stops.length})`,
        critical: true,
      });
      continue;
    }

    // Sort by sequence
    stops.sort((a, b) => a.sequence - b.sequence);

    // Check sequence continuity
    for (let i = 0; i < stops.length; i++) {
      if (stops[i].sequence !== i + 1) {
        errors.push({
          entity: 'train_stops',
          id: stops[i].id,
          field: 'sequence',
          message: `Train '${train.id}' stop sequence broken: expected ${i + 1} but got ${stops[i].sequence}`,
          critical: true,
        });
      }

      // Check chronological ordering between stops (accounting for midnight crossing)
      if (i > 0) {
        const prevDep = timeToSeconds(stops[i - 1].departure_time);
        const currArr = timeToSeconds(stops[i].arrival_time);
        // Allow up to midnight roll-over: currArr can be smaller if overnight
        if (currArr < prevDep && prevDep - currArr < 20 * 3600) {
          warnings.push({
            entity: 'train_stops',
            id: stops[i].id,
            message: `Train '${train.id}' stop ${i + 1} arrival (${stops[i].arrival_time}) is earlier than stop ${i} departure (${stops[i - 1].departure_time})`,
            critical: false,
          });
        }
      }
    }

    // First stop must be origin station
    const firstStop = stops[0];
    if (firstStop.station_id !== train.origin_station_id) {
      errors.push({
        entity: 'train_stops',
        id: firstStop.id,
        message: `Train '${train.id}' first stop station '${firstStop.station_id}' does not match train origin '${train.origin_station_id}'`,
        critical: true,
      });
    }

    // Last stop must be destination station
    const lastStop = stops[stops.length - 1];
    if (lastStop.station_id !== train.destination_station_id) {
      errors.push({
        entity: 'train_stops',
        id: lastStop.id,
        message: `Train '${train.id}' last stop station '${lastStop.station_id}' does not match train destination '${train.destination_station_id}'`,
        critical: true,
      });
    }
  }

  const counts: Record<string, number> = {
    railways: dataset.railways?.length || 0,
    divisions: dataset.divisions?.length || 0,
    lines: dataset.lines?.length || 0,
    routes: dataset.routes?.length || 0,
    stations: dataset.stations?.length || 0,
    trains: dataset.trains?.length || 0,
    train_stops: dataset.train_stops?.length || 0,
  };

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    counts,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Validates an incremental update package before applying to local SQLite.
 */
export function validateUpdatePackage(pkg: UpdatePackage): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!pkg.fromVersion) errors.push('UpdatePackage missing fromVersion');
  if (!pkg.toVersion) errors.push('UpdatePackage missing toVersion');
  if (!pkg.checksum) errors.push('UpdatePackage missing checksum');
  if (!pkg.diff || !pkg.diff.tables) errors.push('UpdatePackage missing diff.tables');

  if (pkg.fromVersion === pkg.toVersion) {
    errors.push(`UpdatePackage fromVersion cannot equal toVersion ('${pkg.fromVersion}')`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

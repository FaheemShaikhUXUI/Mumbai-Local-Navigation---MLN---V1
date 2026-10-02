/**
 * Mumbai Local Offline Timetable Application - Domain Types & Schemas
 */

export type RailwayCode = 'WR' | 'CR';

export interface Railway {
  id: string;
  code: RailwayCode;
  name: string;
  zone: string;
}

export interface Division {
  id: string;
  railway_id: string;
  code: string;
  name: string;
}

export interface Line {
  id: string;
  railway_id: string;
  code: string;
  name: string;
  color: string;
  order_seq: number;
}

export type RouteDirection = 'UP' | 'DN';

export interface Route {
  id: string;
  line_id: string;
  name: string;
  direction: RouteDirection;
  origin_station_id: string;
  destination_station_id: string;
  description?: string;
}

export type StationStatus = 'ACTIVE' | 'INACTIVE';

export interface Station {
  id: string;
  station_code: string;
  station_name: string;
  normalized_name: string;
  aliases: string[];
  latitude?: number;
  longitude?: number;
  zone?: string;
  status: StationStatus;
}

export type TrainType = 'SLOW' | 'FAST' | 'AC_SLOW' | 'AC_FAST' | 'SEMI_FAST';
export type TrainStatus = 'ACTIVE' | 'CANCELLED' | 'SPECIAL';

export interface Train {
  id: string;
  train_number: string;
  train_code: string;
  train_name: string;
  train_type: TrainType;
  origin_station_id: string;
  destination_station_id: string;
  line_id: string;
  route_id: string;
  cars: 12 | 15;
  status: TrainStatus;
}

export type DayPattern = 'DAILY' | 'MON_SAT' | 'SUNDAY_ONLY';

export interface TrainStop {
  id: string;
  train_id: string;
  station_id: string;
  sequence: number;
  arrival_time: string; // HH:MM:SS format
  departure_time: string; // HH:MM:SS format
  day_pattern: DayPattern;
  platform?: string;
}

export interface TimetableVersion {
  version: string;
  created_at: string;
  effective_date: string;
  source: string;
  source_checksum: string;
  dataset_checksum: string;
  schema_version: string;
  record_counts: Record<string, number>;
  is_active: boolean;
}

export interface SyncMetadata {
  key: string;
  value: string;
  updated_at: string;
}

/**
 * Full Canonical Timetable Dataset
 */
export interface CanonicalDataset {
  version: string;
  effectiveDate: string;
  source: string;
  schemaVersion: string;
  datasetChecksum: string;
  createdAt: string;
  railways: Railway[];
  divisions: Division[];
  lines: Line[];
  routes: Route[];
  stations: Station[];
  trains: Train[];
  train_stops: TrainStop[];
}

/**
 * Diff & Incremental Update Models
 */
export interface TableDiff<T> {
  created: T[];
  updated: T[];
  deleted: string[]; // List of IDs deleted
}

export interface TimetableDiff {
  fromVersion: string;
  toVersion: string;
  generatedAt: string;
  schemaVersion: string;
  tables: {
    railways: TableDiff<Railway>;
    divisions: TableDiff<Division>;
    lines: TableDiff<Line>;
    routes: TableDiff<Route>;
    stations: TableDiff<Station>;
    trains: TableDiff<Train>;
    train_stops: TableDiff<TrainStop>;
  };
  summary: {
    totalAdded: number;
    totalUpdated: number;
    totalDeleted: number;
  };
}

export interface UpdatePackage {
  fromVersion: string;
  toVersion: string;
  schemaVersion: string;
  generatedAt: string;
  checksum: string; // SHA-256 of diff payload
  diff: TimetableDiff;
  sizeBytes?: number;
}

/**
 * Distribution Manifest published to Google Drive / CDN / Server
 */
export interface AvailablePatch {
  fromVersion: string;
  toVersion: string;
  patchFile: string;
  patchUrl: string;
  patchChecksum: string;
  patchSizeBytes: number;
}

export interface TimetableManifest {
  latestVersion: string;
  previousVersion?: string;
  schemaVersion: string;
  generatedAt: string;
  effectiveDate: string;
  datasetHash: string;
  datasetFile: string;
  datasetUrl: string;
  updateType: 'FULL' | 'INCREMENTAL';
  incrementalUpdateAvailable: boolean;
  availablePatches: AvailablePatch[];
  metadata: {
    source: string;
    recordCounts: Record<string, number>;
  };
}

/**
 * Storage Provider Abstraction Interface (Section 51)
 */
export interface StoragePublishResult {
  success: boolean;
  url?: string;
  hash?: string;
  error?: string;
}

export interface StorageProvider {
  readonly name: string;
  publishManifest(manifest: TimetableManifest): Promise<StoragePublishResult>;
  publishDataset(version: string, dataset: CanonicalDataset): Promise<StoragePublishResult>;
  publishUpdatePackage(pkg: UpdatePackage): Promise<StoragePublishResult>;
  getManifest(): Promise<TimetableManifest | null>;
  getDataset(version: string): Promise<CanonicalDataset | null>;
  getUpdatePackage(fromVersion: string, toVersion: string): Promise<UpdatePackage | null>;
  backupVersion(version: string): Promise<{ success: boolean; error?: string }>;
  listVersions(): Promise<string[]>;
}

/**
 * Sync Engine Status & Lifecycle
 */
export type SyncStatus =
  | 'SYNC_IDLE'
  | 'SYNC_CHECKING'
  | 'SOURCE_CHANGED'
  | 'PARSING'
  | 'VALIDATING'
  | 'COMPARING'
  | 'GENERATING_UPDATE'
  | 'PUBLISHING'
  | 'SYNC_SUCCESS'
  | 'SYNC_NO_CHANGE'
  | 'SYNC_FAILED';

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  status: SyncStatus;
  source: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Search & Query Models
 */
export interface StationSearchResult {
  station: Station;
  score: number;
  matchedField: 'name' | 'code' | 'alias';
}

export interface TrainSearchResult {
  train: Train;
  fromStop: TrainStop;
  toStop: TrainStop;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  stopsCount: number;
  line: Line;
  route: Route;
  originStation: Station;
  destinationStation: Station;
}

export interface TrainRouteStopDetails extends TrainStop {
  stationName: string;
  stationCode: string;
  isOrigin: boolean;
  isDestination: boolean;
}

export interface TrainRouteDetails {
  train: Train;
  line: Line;
  route: Route;
  originStation: Station;
  destinationStation: Station;
  stops: TrainRouteStopDetails[];
}

/**
 * Validation Models
 */
export interface ValidationError {
  entity: string;
  id?: string;
  field?: string;
  message: string;
  critical: boolean;
}

export interface ValidationReport {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  counts: Record<string, number>;
  validatedAt: string;
}

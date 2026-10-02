-- =====================================================================
-- MUMBAI LOCAL OFFLINE TIMETABLE APPLICATION - CANONICAL SQLITE SCHEMA
-- Normalized relational schema for Android SQLite & Backend Canonical DB
-- =====================================================================

PRAGMA foreign_keys = ON;

-- 1. Railways (Western Railway, Central Railway)
CREATE TABLE IF NOT EXISTS railways (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,       -- 'WR', 'CR'
    name TEXT NOT NULL,
    zone TEXT NOT NULL
);

-- 2. Divisions (Mumbai Central - BCT, Mumbai CSMT - BB)
CREATE TABLE IF NOT EXISTS divisions (
    id TEXT PRIMARY KEY,
    railway_id TEXT NOT NULL,
    code TEXT NOT NULL,              -- 'BCT', 'BB'
    name TEXT NOT NULL,
    FOREIGN KEY (railway_id) REFERENCES railways(id) ON DELETE CASCADE
);

-- 3. Lines / Corridors (Western Suburban, Central Main, Harbour, Trans-Harbour, etc.)
CREATE TABLE IF NOT EXISTS lines (
    id TEXT PRIMARY KEY,
    railway_id TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,       -- 'WR_SUB', 'CR_MAIN', 'HARBOUR', etc.
    name TEXT NOT NULL,
    color TEXT NOT NULL,             -- Hex color for UI representation
    order_seq INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (railway_id) REFERENCES railways(id) ON DELETE CASCADE
);

-- 4. Routes (Directional service patterns: Churchgate-Borivali UP, CSMT-Kalyan DN)
CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    line_id TEXT NOT NULL,
    name TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('UP', 'DN')),
    origin_station_id TEXT NOT NULL,
    destination_station_id TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (line_id) REFERENCES lines(id) ON DELETE CASCADE,
    FOREIGN KEY (origin_station_id) REFERENCES stations(id),
    FOREIGN KEY (destination_station_id) REFERENCES stations(id)
);

-- 5. Stations (Deduplicated canonical station records across all corridors)
CREATE TABLE IF NOT EXISTS stations (
    id TEXT PRIMARY KEY,
    station_code TEXT NOT NULL UNIQUE, -- 'CCG', 'CSMT', 'KYN', 'BVI', etc.
    station_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,     -- Lowercase, cleaned for rapid indexing
    aliases TEXT NOT NULL DEFAULT '[]',-- JSON array of aliases e.g. '["Bombay VT", "CSMT"]'
    latitude REAL,
    longitude REAL,
    zone TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- 6. Trains (Individual scheduled train trips)
CREATE TABLE IF NOT EXISTS trains (
    id TEXT PRIMARY KEY,
    train_number TEXT NOT NULL UNIQUE, -- Official timetable train number e.g. '90001'
    train_code TEXT NOT NULL,
    train_name TEXT NOT NULL,
    train_type TEXT NOT NULL CHECK (train_type IN ('SLOW', 'FAST', 'AC_SLOW', 'AC_FAST', 'SEMI_FAST')),
    origin_station_id TEXT NOT NULL,
    destination_station_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    cars INTEGER NOT NULL DEFAULT 12 CHECK (cars IN (12, 15)),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED', 'SPECIAL')),
    FOREIGN KEY (origin_station_id) REFERENCES stations(id),
    FOREIGN KEY (destination_station_id) REFERENCES stations(id),
    FOREIGN KEY (line_id) REFERENCES lines(id),
    FOREIGN KEY (route_id) REFERENCES routes(id)
);

-- 7. Train Stops (Chronological station stops for each train)
CREATE TABLE IF NOT EXISTS train_stops (
    id TEXT PRIMARY KEY,
    train_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,          -- 1, 2, 3... strictly ordered
    arrival_time TEXT NOT NULL,         -- HH:MM:SS format
    departure_time TEXT NOT NULL,       -- HH:MM:SS format
    day_pattern TEXT NOT NULL DEFAULT 'DAILY' CHECK (day_pattern IN ('DAILY', 'MON_SAT', 'SUNDAY_ONLY')),
    platform TEXT,
    FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE CASCADE,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
    UNIQUE (train_id, sequence),
    UNIQUE (train_id, station_id)
);

-- 8. Timetable Versions (Track installed, previous, and canonical versions)
CREATE TABLE IF NOT EXISTS timetable_versions (
    version TEXT PRIMARY KEY,           -- Deterministic YYYY.MM.DD.NNN
    created_at TEXT NOT NULL,
    effective_date TEXT NOT NULL,
    source TEXT NOT NULL,
    source_checksum TEXT NOT NULL,
    dataset_checksum TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    record_counts TEXT NOT NULL,        -- JSON object of counts
    is_active INTEGER NOT NULL DEFAULT 0
);

-- 9. Sync Metadata (Key-value store for app sync state, ETag, last check time)
CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- =====================================================================
-- PERFORMANCE INDICES FOR INSTANT OFFLINE SEARCH
-- =====================================================================

-- Instant Station Autocomplete & Code Search
CREATE INDEX IF NOT EXISTS idx_stations_code ON stations(station_code);
CREATE INDEX IF NOT EXISTS idx_stations_normalized ON stations(normalized_name);
CREATE INDEX IF NOT EXISTS idx_stations_name ON stations(station_name);

-- Fast From -> To Train Search
-- 1. Find all train stops matching From Station
CREATE INDEX IF NOT EXISTS idx_stops_station_dep ON train_stops(station_id, departure_time);
-- 2. Find matching train stops by train and sequence
CREATE INDEX IF NOT EXISTS idx_stops_train_seq ON train_stops(train_id, sequence);
-- 3. Composite for sequence & station lookups
CREATE INDEX IF NOT EXISTS idx_stops_train_station ON train_stops(train_id, station_id);

-- Trains filtering by line, route, origin/destination
CREATE INDEX IF NOT EXISTS idx_trains_line ON trains(line_id);
CREATE INDEX IF NOT EXISTS idx_trains_route ON trains(route_id);
CREATE INDEX IF NOT EXISTS idx_trains_od ON trains(origin_station_id, destination_station_id);
CREATE INDEX IF NOT EXISTS idx_trains_number ON trains(train_number);

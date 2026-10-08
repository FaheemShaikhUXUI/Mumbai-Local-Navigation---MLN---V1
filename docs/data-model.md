# Data Model & Relational Schema — Mumbai Local Application

## 1. Domain Entity Hierarchy

The timetable domain strictly follows the official Indian Railways operational hierarchy:

```
Railway (WR, CR)
   ↓
Division (Mumbai Central BCT, Mumbai CSMT BB)
   ↓
Corridor / Line (Western Suburban, Central Main, Harbour, Trans-Harbour, etc.)
   ↓
Route (Directional Pattern e.g. Churchgate–Virar DN, CSMT–Kalyan UP)
   ↓
Station (Canonical deduplicated station entity)
   ↓
Train (Individual scheduled trip e.g. 90001, 97001)
   ↓
Train Stop (Ordered station arrival/departure schedule)
```

---

## 2. Table Specifications

### 1. `railways`
Represents the zonal railway administration.
- `id` (TEXT, PK): Unique identifier e.g. `railway_wr`, `railway_cr`.
- `code` (TEXT, UNIQUE): Official zonal code e.g. `WR`, `CR`.
- `name` (TEXT): Full name e.g. `Western Railway`.
- `zone` (TEXT): Zone identifier e.g. `Western`.

### 2. `divisions`
Represents operating divisions within the zone.
- `id` (TEXT, PK): e.g. `div_bct`, `div_bb`.
- `railway_id` (TEXT, FK): References `railways.id`.
- `code` (TEXT): Division code e.g. `BCT` (Mumbai Central), `BB` (Mumbai CSMT).
- `name` (TEXT): Division name.

### 3. `lines`
Suburban corridors and branches.
- `id` (TEXT, PK): e.g. `line_wr_suburban`, `line_cr_main`, `line_cr_harbour`, `line_cr_trans_harbour`.
- `railway_id` (TEXT, FK): References `railways.id`.
- `code` (TEXT, UNIQUE): e.g. `WR_SUBURBAN`, `CR_MAIN`, `HARBOUR`, `TRANS_HARBOUR`.
- `name` (TEXT): Human-readable name.
- `color` (TEXT): Hex code for UI rendering (e.g. `#DC2626` for WR, `#B91C1C` for CR, `#0284C7` for Harbour, `#16A34A` for Trans-Harbour).
- `order_seq` (INTEGER): Sort display priority.

### 4. `routes`
Directional service patterns linking an origin and destination station.
- `id` (TEXT, PK): e.g. `route_wr_ccg_vr_dn`.
- `line_id` (TEXT, FK): References `lines.id`.
- `name` (TEXT): e.g. `Churchgate to Virar Down`.
- `direction` (TEXT): `'UP'` or `'DN'`.
- `origin_station_id` (TEXT, FK): References `stations.id`.
- `destination_station_id` (TEXT, FK): References `stations.id`.
- `description` (TEXT): Optional route notes.

### 5. `stations`
Canonical deduplicated railway station records.
- `id` (TEXT, PK): e.g. `stn_ccg`, `stn_dr`, `stn_kyn`.
- `station_code` (TEXT, UNIQUE): Official IR code e.g. `CCG`, `DR`, `KYN`, `CSMT`.
- `station_name` (TEXT): Official display name e.g. `CSMT`.
- `normalized_name` (TEXT): Lowercase, alphanumeric only for index searches.
- `aliases` (TEXT): JSON array of historical names and abbreviations e.g. `["VT", "CST", "Victoria Terminus"]`.
- `latitude` (REAL): Coordinates for distance/map calculations.
- `longitude` (REAL): Coordinates.
- `zone` (TEXT): `WR` or `CR`.
- `status` (TEXT): `'ACTIVE'` or `'INACTIVE'`.

### 6. `trains`
Individual scheduled passenger services.
- `id` (TEXT, PK): e.g. `train_wr_90001`, `train_cr_97001`.
- `train_number` (TEXT, UNIQUE): Timetable train number e.g. `90001`.
- `train_code` (TEXT): e.g. `S-01`, `CR-01`.
- `train_name` (TEXT): Display name e.g. `Virar Slow`, `Kalyan Fast`.
- `train_type` (TEXT): `'SLOW' | 'FAST' | 'AC_SLOW' | 'AC_FAST' | 'SEMI_FAST'`.
- `origin_station_id` (TEXT, FK): References `stations.id`.
- `destination_station_id` (TEXT, FK): References `stations.id`.
- `line_id` (TEXT, FK): References `lines.id`.
- `route_id` (TEXT, FK): References `routes.id`.
- `cars` (INTEGER): `12` or `15`.
- `status` (TEXT): `'ACTIVE' | 'CANCELLED' | 'SPECIAL'`.

### 7. `train_stops`
Chronological stop entries.
- `id` (TEXT, PK): e.g. `stop_90001_1`.
- `train_id` (TEXT, FK): References `trains.id`.
- `station_id` (TEXT, FK): References `stations.id`.
- `sequence` (INTEGER): `1, 2, 3...` strictly monotonic.
- `arrival_time` (TEXT): `HH:MM:SS`.
- `departure_time` (TEXT): `HH:MM:SS`.
- `day_pattern` (TEXT): `'DAILY' | 'MON_SAT' | 'SUNDAY_ONLY'`.
- `platform` (TEXT): Platform number e.g. `'1'`, `'3'`.

### 8. `timetable_versions`
Historical and active version ledger.
- `version` (TEXT, PK): Deterministic `YYYY.MM.DD.NNN`.
- `created_at` (TEXT): ISO timestamp.
- `effective_date` (TEXT): Official effective date e.g. `2026-09-01`.
- `source` (TEXT): Origin source URL or publication description.
- `source_checksum` (TEXT): SHA-256 of raw scraped files.
- `dataset_checksum` (TEXT): SHA-256 of compiled dataset.
- `schema_version` (TEXT): e.g. `1.0.0`.
- `record_counts` (TEXT): JSON breakdown of table counts.
- `is_active` (INTEGER): `1` if current active version, `0` otherwise.

### 9. `sync_metadata`
Key-value state for sync cursors.
- `key` (TEXT, PK): Setting name e.g. `active_version`, `last_etag`.
- `value` (TEXT): Setting value.
- `updated_at` (TEXT): ISO timestamp.

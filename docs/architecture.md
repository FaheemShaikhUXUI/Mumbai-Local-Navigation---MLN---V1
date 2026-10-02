# System Architecture — Mumbai Local Offline Timetable Application

## 1. Executive Summary & Design Principles

The Mumbai Local Offline Timetable Application is an enterprise-grade, offline-first timetable navigation system for the Mumbai Suburban Railway Network (Western Railway and Central Railway corridors).

The architecture is built on three core pillars:
1. **Zero-Client Scraping**: Android devices never scrape or query Indian Railways directly. A single centralized cloud backend sync engine inspects official railway sources every 6 hours, parses, normalizes, validates, diffs, and publishes verified artifacts.
2. **Offline-First Android Performance**: The complete suburban schedule is stored locally in an embedded SQLite database. Station searches, From &rarr; To journey lookups, and route views execute with zero network dependency and microsecond latency.
3. **Bandwidth-Optimized Incremental Updates**: Instead of forcing users to re-download a ~50 MB database when train times change, the backend generates granular, cryptographically-signed incremental patch packages (~735 bytes to 25 KB). Android applies these patches inside atomic SQLite transactions with automatic rollback protection.

---

## 2. High-Level System Architecture Diagram

```
                        OFFICIAL RAILWAY SOURCES
                   (Western Railway & Central Railway)
                                    │
                                    │ Checked every 6 hours
                                    ▼
                     ┌──────────────────────────────┐
                     │      CLOUD SYNC ENGINE       │
                     │  ETag / SHA-256 Change Check │
                     │  Official Source Adapters    │
                     │  Normalizer & Deduplicator   │
                     │  Data Integrity Validator    │
                     │  Diff Engine & Version Mgr   │
                     └──────────────┬───────────────┘
                                    │
                                    ▼
                         CANONICAL BACKEND DATASET
                                    │
                                    ▼
                     ┌──────────────────────────────┐
                     │   STORAGE DISTRIBUTION LAYER │
                     │       (StorageProvider)      │
                     │                              │
                     │  ├── Google Drive Repository │
                     │  ├── Cloud Object Store / S3 │
                     │  └── Local Mock Provider     │
                     └──────────────┬───────────────┘
                                    │
                         Distribution Manifest
                         & Incremental Patches
                                    │
                                    ▼
                     ┌──────────────────────────────┐
                     │     ANDROID MOBILE CLIENT    │
                     │                              │
                     │  Background WorkManager Check│
                     │  SHA-256 Checksum Validation │
                     │  Transactional SQLite Engine │
                     │  Multi-Strategy Search Engine│
                     │  Offline Journey Planner     │
                     └──────────────────────────────┘
```

---

## 3. Component Breakdown

### A. Official Data Sources & Adapters (`/services/data-sources`)
- Isolated adapters for Western Railway (`services/data-sources/src/western-railway`) and Central Railway (`services/data-sources/src/central-railway`).
- Handles network TLS nuances, HTTP header caching (ETag, Last-Modified), HTML/PDF parsing, and time formatting.
- `CanonicalCompiler`: Merges WR and CR schedules and deduplicates interchange stations (e.g., Dadar `DR`, Kurla `CLA`, Thane `TNA`, Panvel `PNVL`) into a single canonical station record.

### B. Diff & Incremental Update Engine (`/services/diff-engine`)
- Compares previous version canonical JSON with newly ingested version JSON.
- Generates record-level `created`, `updated`, and `deleted` arrays for each table: `railways`, `divisions`, `lines`, `routes`, `stations`, `trains`, `train_stops`.
- Serializes into an `UpdatePackage` with a SHA-256 payload checksum.

### C. Storage Provider Abstraction (`/packages/shared/src/storage`)
- Defines standard `StorageProvider` interface (`publishManifest`, `publishDataset`, `publishUpdatePackage`, `getManifest`, `getDataset`, `getUpdatePackage`).
- Primary implementation: `GoogleDriveStorageProvider` (manages `current/`, `updates/`, `backups/`, `source/`, `logs/`).
- Fallback/Migration: `LocalStorageProvider` and `S3StorageProvider`. Google Drive is completely swappable without client rewrites.

### D. Android Database & Safe Rollback (`/packages/database`)
- Local SQLite database on device.
- `DatabaseManager`: Implements two-phase atomic update. If any checksum, sequence constraint, or foreign key check fails during update application, the entire transaction is rolled back immediately, keeping the previous working database 100% intact.

### E. Search Engine (`/packages/search`)
- `StationSearchEngine`: Fast autocomplete, exact code matching (`KYN`), exact station name (`Kalyan`), alias resolution (`VT` &rarr; `CSMT`), prefix matching, and Levenshtein typo tolerance.
- `TrainSearchEngine`: Finds all trains serving both From and To stations, verifies chronological stop sequence (`to.sequence > from.sequence`), calculates departure/arrival/duration, and sorts by departure.
- `LineExplorer`: Line-wise station browser without duplicating station entities.

---

## 4. Scalability Analysis

| Metric | Direct Client Scraping (Antipattern) | Centralized Architecture (Our System) |
|---|---|---|
| Load on Indian Railways servers | 100,000 requests / 6 hours | **1 request / 6 hours** |
| Risk of IP banning | Critical / High | **Zero (controlled server requests)** |
| User mobile data per update | ~50 MB (Full DB download) | **~735 B to 25 KB (Patch)** |
| Offline Availability | Fails without internet | **100% functional offline** |
| Client Battery Consumption | High (parsing & network) | **Minimal (lightweight local query)** |

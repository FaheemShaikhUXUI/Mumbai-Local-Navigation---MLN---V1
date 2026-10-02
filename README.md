# Mumbai Local Offline Timetable Application (Phase 1)

A production-grade, offline-first timetable application for the Mumbai Suburban Railway Network (Western Railway and Central Railway).

Built with clean architecture designed to scale seamlessly to millions of commuters without scraping or overloading official railway infrastructure.

---

## Key Architectural Highlights

* **Official Railway Data Synchronization**: Scheduled automated checks every 6 hours against official Western Railway and Central Railway timetable portals using ETag, Last-Modified, and SHA-256 change detection.
* **Controlled Central Timetable Repository**: Uses Google Drive as the controlled timetable distribution repository with an abstracted `StorageProvider` interface that is swappable for AWS S3 / Cloudflare R2 / CDN without changing Android application code.
* **Offline-First Embedded SQLite Engine**: Complete local SQLite relational database on device. Sub-millisecond journey searches, autocomplete, and route inspections work with 100% offline capability.
* **Ultra-Low Bandwidth Incremental Diff Updates**: Generates cryptographically-signed incremental patch packages (~735 bytes to 25 KB) instead of forcing full ~50 MB database downloads for timetable changes.
* **Safe Two-Phase Transactional Rollback**: If an update package fails checksum or referential integrity checks, the update is rolled back automatically, preserving the active database.
* **Multi-Strategy Search Engine**: Instant lookup by station name, code (`KYN`, `CCG`, `CSMT`), alias (`VT` &rarr; `CSMT`, `Bombay Central` &rarr; `MMCT`), prefix (`kaly`), and typo tolerance.

---

## Monorepo Structure

```
├── apps/
│   ├── mobile/                     # Android React Native / Expo application
│   └── web-admin/                  # Developer & Ingestion Dashboard
├── services/
│   ├── sync-engine/                # 6-hour scheduler, source checking, CLI
│   ├── timetable-parser/           # Schedule parsing & compiler
│   ├── diff-engine/                # Record-level CREATE/UPDATE/DELETE diff engine
│   └── data-sources/               # Isolated WR and CR official source adapters
├── packages/
│   ├── database/                   # SQLite adapters, DatabaseManager, safe rollback
│   ├── types/                      # Comprehensive TypeScript domain models
│   ├── validation/                 # Strict railway schema and integrity rules
│   ├── search/                     # Station search, train search, line explorer
│   └── shared/                     # Storage providers (Google Drive, S3, Local), checksums
├── data/
│   └── schemas/schema.sql          # Canonical SQLite relational schema with indices
├── docs/                           # Architecture, data model, build & deployment docs
├── storage/google-drive-mock/      # Local repository mock mimicking Google Drive
├── api/                            # Vercel serverless API routes
└── vercel.json                     # Vercel deployment with 6-hour cron schedule
```

---

## Quick Start & Verification

### 1. Run the End-to-End Verification Demo
Verifies all 15 Phase 1 success criteria including ingestion, validation, diff generation, Android SQLite update, offline search, Section 35 update propagation, and Section 36 rollback:
```bash
node dist/services/sync-engine/src/e2e-demo.js
```

### 2. Start Developer Dashboard & Mobile Simulator
```bash
node dist/apps/web-admin/src/server.js
```
Open in browser:
- **Developer & Admin Dashboard**: `http://localhost:3000/`
- **Android Mobile App View**: `http://localhost:3000/mobile`
- **Sync Status API**: `http://localhost:3000/api/sync/status`

### 3. Sync Engine CLI
```bash
# Check official sources for changes
node dist/services/sync-engine/src/cli.js check

# Run complete synchronization and publishing pipeline
node dist/services/sync-engine/src/cli.js sync

# Simulate Section 35 update (Kalyan 07:20 -> 07:23)
node dist/services/sync-engine/src/cli.js simulate

# Test Section 36 Rollback on corrupted payload
node dist/services/sync-engine/src/cli.js rollback-test
```

---

## Documentation

Full architectural documentation is available in the [`docs/`](./docs) folder:
- [System Architecture](docs/architecture.md)
- [Data Model & Schema](docs/data-model.md)
- [Official Data Ingestion](docs/official-data-ingestion.md)
- [Sync Engine & Scheduling](docs/sync-engine.md)
- [Incremental Updates & Diffs](docs/incremental-updates.md)
- [Offline SQLite & Rollback](docs/offline-database.md)
- [Android Build Process](docs/android-build.md)
- [Cloud Deployment (GitHub & Vercel)](docs/deployment.md)
- [Testing & Test Scenarios](docs/testing.md)

---

## License
MIT

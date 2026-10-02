# Testing Guide & Test Scenarios — Mumbai Local Application

## 1. Automated Test Suite Overview

The testing suite covers all 56 functional criteria specified in Phase 1:
- Unit tests: Station search, typo tolerance, alias resolution, sequence validation.
- Integration tests: Database manager, atomic transactions, diff engine, compiler.
- End-to-End tests: 15-step complete verification runner (`services/sync-engine/src/e2e-demo.ts`).

---

## 2. Running Automated Tests

Run the full end-to-end verification suite:
```bash
npm run demo:e2e
```
Or directly with Node:
```bash
node dist/services/sync-engine/src/e2e-demo.js
```

---

## 3. Key Test Scenarios

### Scenario A: Section 35 — Incremental Timetable Update
- **Initial State**: Version `001`, Train `97001` (Kalyan Fast) has Kalyan arrival/departure at `07:20:00`.
- **Modification**: Official source changes Kalyan departure to `07:23:00`.
- **Engine Action**: Computes diff (exactly 1 stop updated), packages into `UpdatePackage` (735 bytes).
- **Client Action**: Android detects `002`, downloads the 735-byte patch, applies transactionally.
- **Verification**: Train `97001` now shows `07:23:00`. Unrelated stations and trains remain completely untouched.

### Scenario B: Section 36 — Transactional Rollback Protection
- **Simulated Fault**: A corrupted patch payload is delivered with invalid negative stop sequences (`sequence: -99`) and corrupted checksum.
- **Client Action**: Android begins transaction, runs integrity validation, catches sequence error.
- **Engine Action**: Transaction is immediately rolled back via `ROLLBACK TRANSACTION`.
- **Verification**: Current database version remains on the previous working version. Zero data corruption.

### Scenario C: Section 34 — Offline Journey Search
- **Test Condition**: Simulated network offline switch engaged.
- **Action**: Search stations with partial queries ("kaly", "CCG", "VT").
- **Verification**: Queries return instantly from local SQLite without making HTTP calls.

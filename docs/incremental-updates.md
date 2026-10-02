# Incremental Updates & Diff Engine

## 1. The Mobile Data Conservation Challenge

In standard mobile applications, updating a local database requires downloading the entire database artifact (typically 20 MB to 50 MB compressed). For 100,000+ Android commuters in Mumbai with varying mobile connectivity, this wastes bandwidth, drains battery, and leads to failed downloads.

The Mumbai Local Timetable Application solves this with **record-level diff generation**. When a train time is modified by a few minutes, only a tiny patch payload is transferred.

### Real Test Benchmark (Section 35 Scenario):
- Full Database Dataset: **~50 MB**
- Incremental Patch Size: **735 Bytes**
- Bandwidth Saved: **> 99.98%**

---

## 2. Diff Package Format (`UpdatePackage`)

An update package contains only the delta between two versions:
```json
{
  "fromVersion": "2026.10.02.001",
  "toVersion": "2026.10.02.002",
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-10-02T05:54:10.000Z",
  "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "diff": {
    "fromVersion": "2026.10.02.001",
    "toVersion": "2026.10.02.002",
    "tables": {
      "railways": { "created": [], "updated": [], "deleted": [] },
      "divisions": { "created": [], "updated": [], "deleted": [] },
      "lines": { "created": [], "updated": [], "deleted": [] },
      "routes": { "created": [], "updated": [], "deleted": [] },
      "stations": { "created": [], "updated": [], "deleted": [] },
      "trains": { "created": [], "updated": [], "deleted": [] },
      "train_stops": {
        "created": [],
        "updated": [
          {
            "id": "stop_97001_8",
            "train_id": "train_cr_97001",
            "station_id": "stn_kyn",
            "sequence": 8,
            "arrival_time": "07:23:00",
            "departure_time": "07:23:00",
            "day_pattern": "DAILY",
            "platform": "2"
          }
        ],
        "deleted": []
      }
    },
    "summary": {
      "totalAdded": 0,
      "totalUpdated": 1,
      "totalDeleted": 0
    }
  },
  "sizeBytes": 735
}
```

---

## 3. Safe Multi-Version Chaining

If a user device is running version `001` and the latest repository version is `003`:
1. **Chained Patching**: Device downloads `patch-001-to-002.json` and `patch-002-to-003.json`.
2. **Direct Fallback**: If the version gap exceeds 5 iterations or an intermediate patch is unavailable, the client downloads the full dataset snapshot.

# Offline SQLite Database & Rollback Architecture

## 1. Zero-Network Guarantee

After initial installation or synchronization, all timetable operations run 100% locally from the device's embedded SQLite database. Network connectivity is only required for:
1. First install full database download.
2. Checking if a new published manifest exists.
3. Downloading lightweight incremental patches.

Normal journey planning, station searches, and route inspections never make HTTP requests.

---

## 2. Two-Phase Safe Transaction & Rollback (Section 16 & 36)

Updates are never applied destructively to the active SQLite tables. The update lifecycle executes in a strict atomic transaction:

```
                  DOWNLOAD UPDATE PACKAGE
                             │
                             ▼
                  VERIFY SHA-256 CHECKSUM
                             │
                      ┌──────┴──────┐
                    Match        Mismatch
                      │             │
                      │             ▼
                      │       REJECT UPDATE (Keep DB intact)
                      │
                      ▼
               BEGIN TRANSACTION
                      │
                      ▼
               APPLY RECORD DIFFS
         (Delete Removed -> Insert Added -> Update Changed)
                      │
                      ▼
            RUN INTEGRITY CHECKS
         (Verify sequences >= 1, valid foreign keys)
                      │
               ┌──────┴──────┐
             Passed        Failed
               │             │
               │             ▼
               │       ROLLBACK TRANSACTION
               │       Keep previous working DB
               │
               ▼
       COMMIT TRANSACTION
               │
               ▼
     UPDATE ACTIVE VERSION POINTER
```

---

## 3. Database Indexes for High-Speed Mobile Search

To ensure sub-millisecond query responses on low-end Android hardware, the SQLite database defines 8 specialized indices:
1. `idx_stations_code`: Instant uppercase station code lookup (`KYN`, `CCG`, `CSMT`).
2. `idx_stations_normalized`: Cleaned lowercase string matching.
3. `idx_stations_name`: Full station name prefix matching.
4. `idx_stops_station_dep`: Composite index on `station_id` and `departure_time` for instant departure queries.
5. `idx_stops_train_seq`: Fast station sequence retrieval along routes.
6. `idx_stops_train_station`: Fast lookups for train membership.
7. `idx_trains_line`: Line corridor filtering.
8. `idx_trains_od`: Direct origin/destination matching.

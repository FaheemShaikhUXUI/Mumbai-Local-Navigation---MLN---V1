# Six-Hour Backend Synchronization Engine

## 1. Scheduling & Interval Configuration

The Sync Engine operates on a default 6-hour cycle, configurable through the environment:
```bash
SYNC_INTERVAL_HOURS=6
```

In production, the sync cycle is triggered automatically via:
1. **Vercel Cron**: Calls `/api/sync/cron` at `0 */6 * * *`.
2. **CLI Runner**: Invoked by server cron via `npm run sync:run`.
3. **Admin Dashboard**: Triggered manually by authorized operators via the "Sync Now" button.

---

## 2. Sync Execution Lifecycle States

The sync process is tracked through a deterministic state machine:

```
[SYNC_IDLE]
     │
     ▼
[SYNC_CHECKING] ──(No change)──► [SYNC_NO_CHANGE] ──► [SYNC_IDLE]
     │
 (Changed)
     ▼
[SOURCE_CHANGED]
     │
     ▼
  [PARSING]
     │
     ▼
 [VALIDATING] ──(Errors)───────► [SYNC_FAILED] (Keep Previous Active)
     │
  (Valid)
     ▼
 [COMPARING]
     │
     ▼
[GENERATING_UPDATE]
     │
     ▼
 [PUBLISHING] ──(Failure)──────► [SYNC_FAILED] (Rollback publication)
     │
  (Success)
     ▼
 [SYNC_SUCCESS] ──► [SYNC_IDLE]
```

---

## 3. Strict Validation Gates (Section 20)

Before any new timetable version is published, it must pass 100% of validation rules:
- **No Duplicate Station Codes or IDs**.
- **No Duplicate Train Numbers**.
- **Chronological Stop Sequences**: Stop $N$ departure time must be $\ge$ arrival time, and sequence must be continuous ($1, 2, 3...$).
- **Matching Origins & Destinations**: Stop 1 must equal train origin, final stop must equal train destination.
- **Referential Integrity**: All stops and routes must point to existing stations and lines.

> **Critical Safety Rule**: If any validation rule fails, publication is immediately aborted, the previous production version remains active, and error logs are stored for review.

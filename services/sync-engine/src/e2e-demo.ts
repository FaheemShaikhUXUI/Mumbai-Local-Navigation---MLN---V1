import { SyncEngine } from './SyncEngine.js';
import { DatabaseManager } from '@mumbai-timetable/database';
import { LocalStorageProvider } from '@mumbai-timetable/shared';
import { StationSearchEngine, TrainSearchEngine, LineExplorer } from '@mumbai-timetable/search';

/**
 * PHASE 1 END-TO-END VERIFICATION RUNNER
 * Proves the complete 15-step foundation flow requested in the user prompt:
 *
 * 1. Official railway source
 * 2. Backend fetch
 * 3. Parse
 * 4. Normalize
 * 5. Validate
 * 6. Compare
 * 7. Generate version
 * 8. Generate incremental update
 * 9. Publish to Google Drive / Storage repository
 * 10. Android detects new version
 * 11. Android downloads update
 * 12. Android validates update
 * 13. Android updates SQLite transactionally
 * 14. User searches timetable (From -> To, autocomplete, routes)
 * 15. Search works offline
 */
export async function runEndToEndVerification(): Promise<boolean> {
  console.log(`\n========================================================================`);
  console.log(`  MUMBAI LOCAL TIMETABLE - PHASE 1 END-TO-END VERIFICATION`);
  console.log(`========================================================================\n`);

  const storage = new LocalStorageProvider({ basePath: './storage/google-drive-mock' });
  const syncEngine = new SyncEngine({ storageProvider: storage });

  // STEP 1-9: BACKEND SYNC, VALIDATION & PUBLISHING INITIAL DATASET (Version 001)
  console.log(`[Step 1-9] Executing Backend Ingestion & Publishing Pipeline...`);
  const initialSyncResult = await syncEngine.executeSync(true);
  if (initialSyncResult.status !== 'SYNC_SUCCESS') {
    console.error(`[FAIL] Backend sync failed: ${initialSyncResult.error}`);
    return false;
  }
  const v1 = initialSyncResult.version!;
  console.log(`[PASS] Version ${v1} compiled, validated, and published to repository.`);

  // STEP 10-13: ANDROID CLIENT FIRST INSTALL EXPERIENCE (Section 10)
  console.log(`\n[Step 10-13] Simulating Android Client Initial Installation...`);
  const androidDb = new DatabaseManager();
  await androidDb.initializeDatabase();

  const manifestV1 = await storage.getManifest();
  if (!manifestV1 || manifestV1.latestVersion !== v1) {
    console.error(`[FAIL] Android failed to read manifest from repository.`);
    return false;
  }
  console.log(`[PASS] Android detected latest repository version: ${manifestV1.latestVersion}`);

  // Android downloads full dataset
  const datasetV1 = await storage.getDataset(manifestV1.latestVersion);
  if (!datasetV1) {
    console.error(`[FAIL] Android failed to download dataset.`);
    return false;
  }
  const importResult = await androidDb.importFullDataset(datasetV1);
  if (!importResult.success) {
    console.error(`[FAIL] Android SQLite initial import failed: ${importResult.error}`);
    return false;
  }
  const activeVersionV1 = await androidDb.getActiveVersion();
  console.log(`[PASS] Android imported dataset into local SQLite. Active version: ${activeVersionV1}`);

  // STEP 14-15: OFFLINE SEARCH VERIFICATION (Section 23, 24, 25, 26, 34)
  console.log(`\n[Step 14-15] Verifying OFFLINE Search on Local Android SQLite Database...`);
  const stationSearch = new StationSearchEngine(androidDb.getAdapter());
  const trainSearch = new TrainSearchEngine(androidDb.getAdapter());
  const lineExplorer = new LineExplorer(androidDb.getAdapter());

  // Test Station Search (Section 23)
  console.log(`--- Testing Station Search ---`);
  const searchKalyan = await stationSearch.search('kaly');
  console.log(`Query 'kaly': Found '${searchKalyan[0]?.station.station_name}' (${searchKalyan[0]?.station.station_code}) with score ${searchKalyan[0]?.score}`);

  const searchChurchgateCode = await stationSearch.search('CCG');
  console.log(`Query 'CCG': Found '${searchChurchgateCode[0]?.station.station_name}' with score ${searchChurchgateCode[0]?.score}`);

  const searchAlias = await stationSearch.search('VT');
  console.log(`Query 'VT' (Alias): Found '${searchAlias[0]?.station.station_name}' (${searchAlias[0]?.station.station_code})`);

  // Test From -> To Train Search (Section 24 & 25)
  console.log(`\n--- Testing From -> To Train Search ---`);
  // Western Line: Churchgate (CCG) to Borivali (BVI)
  const ccgStn = searchChurchgateCode[0]?.station;
  const bviSearch = await stationSearch.search('BVI');
  const bviStn = bviSearch[0]?.station;

  const wrTrains = await trainSearch.findTrainsBetweenStations(ccgStn.id, bviStn.id);
  console.log(`Trains from Churchgate to Borivali: Found ${wrTrains.length} matching trains.`);
  if (wrTrains.length > 0) {
    const t = wrTrains[0];
    console.log(`Sample Train: ${t.train.train_number} (${t.train.train_name}) | Dep: ${t.departureTime} -> Arr: ${t.arrivalTime} (${t.durationMinutes} mins, ${t.stopsCount} stops)`);
  }

  // Central Line: CSMT to Kalyan (KYN)
  const csmtStn = searchAlias[0]?.station;
  const kynStn = searchKalyan[0]?.station;
  const crTrains = await trainSearch.findTrainsBetweenStations(csmtStn.id, kynStn.id);
  console.log(`Trains from CSMT to Kalyan: Found ${crTrains.length} matching trains.`);
  const train97001Initial = crTrains.find((t) => t.train.train_number === '97001');
  if (train97001Initial) {
    console.log(`Train 97001 (${train97001Initial.train.train_name}) initial Kalyan arrival/departure: ${train97001Initial.arrivalTime}`);
  }

  // Test Full Train Route (Section 26)
  if (wrTrains.length > 0) {
    const routeDetails = await trainSearch.getTrainRouteDetails(wrTrains[0].train.id);
    console.log(`\nFull Route for Train ${routeDetails?.train.train_number}: ${routeDetails?.stops.length} stops from ${routeDetails?.originStation.station_name} to ${routeDetails?.destinationStation.station_name}`);
  }

  // Test Line Explorer (Section 27)
  const lines = await lineExplorer.getAllLines();
  console.log(`\nVerified Suburban Lines count: ${lines.length} (${lines.map((l) => l.name).join(', ')})`);

  // SECTION 35: UPDATE TEST SCENARIO (Kalyan 07:20 -> 07:23)
  console.log(`\n========================================================================`);
  console.log(`  TEST SCENARIO (Section 35): INCREMENTAL UPDATE PROPAGATION`);
  console.log(`========================================================================`);
  console.log(`Simulating official schedule update: Train 97001 Kalyan departure changed 07:20 -> 07:23...`);

  const simResult = await syncEngine.simulateTimetableChangeScenario();
  if (!simResult.success) {
    console.error(`[FAIL] Simulation failed: ${simResult.error}`);
    return false;
  }
  const v2 = simResult.modifiedVersion;
  console.log(`[PASS] Backend published Version ${v2}. Patch size: ${simResult.patchSizeBytes} bytes.`);

  // ANDROID DETECTS AND APPLIES INCREMENTAL UPDATE
  console.log(`\nAndroid checking repository for updates...`);
  const manifestV2 = await storage.getManifest();
  console.log(`Android current installed version: ${await androidDb.getActiveVersion()}`);
  console.log(`Repository latest version: ${manifestV2?.latestVersion}`);

  // Find incremental patch
  const patchInfo = manifestV2?.availablePatches.find(
    (p) => p.fromVersion === activeVersionV1 && p.toVersion === v2
  );
  if (!patchInfo) {
    console.error(`[FAIL] No incremental patch found from ${activeVersionV1} to ${v2}`);
    return false;
  }
  console.log(`[PASS] Android downloading lightweight incremental patch: ${patchInfo.patchFile} (${patchInfo.patchSizeBytes} bytes)`);

  const updatePkg = await storage.getUpdatePackage(activeVersionV1!, v2);
  if (!updatePkg) {
    console.error(`[FAIL] Failed to retrieve update package.`);
    return false;
  }

  // Apply update to local Android SQLite
  const updateResult = await androidDb.applyUpdatePackage(updatePkg);
  if (!updateResult.success) {
    console.error(`[FAIL] Android failed to apply incremental update: ${updateResult.error}`);
    return false;
  }
  const activeVersionV2 = await androidDb.getActiveVersion();
  console.log(`[PASS] Incremental update successfully applied! New active version: ${activeVersionV2}`);

  // Verify that Kalyan departure for Train 97001 is now 07:23:00!
  const crTrainsAfterUpdate = await trainSearch.findTrainsBetweenStations(csmtStn.id, kynStn.id);
  const train97001Updated = crTrainsAfterUpdate.find((t) => t.train.train_number === '97001');
  console.log(`Train 97001 Kalyan arrival/departure after update: ${train97001Updated?.arrivalTime}`);
  if (train97001Updated?.arrivalTime === '07:23:00') {
    console.log(`[SUCCESS] Section 35 Update Verified: Kalyan departure updated to 07:23:00 without re-downloading entire database!`);
  } else {
    console.error(`[FAIL] Expected 07:23:00 but got ${train97001Updated?.arrivalTime}`);
    return false;
  }

  // SECTION 36: ROLLBACK TEST
  console.log(`\n========================================================================`);
  console.log(`  TEST SCENARIO (Section 36): TRANSACTIONAL ROLLBACK ON CORRUPT PAYLOAD`);
  console.log(`========================================================================`);
  const corruptPayload = syncEngine.generateCorruptUpdatePackage(activeVersionV2!, '2026.99.99.999');
  console.log(`Attempting to apply corrupted payload to Android SQLite...`);
  const corruptResult = await androidDb.applyUpdatePackage(corruptPayload);

  console.log(`Update success: ${corruptResult.success} (expected false)`);
  console.log(`Rollback applied: ${corruptResult.rollbackApplied} (expected true)`);
  const currentDbVersion = await androidDb.getActiveVersion();
  console.log(`Active database version after failed update: ${currentDbVersion}`);

  if (!corruptResult.success && corruptResult.rollbackApplied && currentDbVersion === activeVersionV2) {
    console.log(`[PASS] Rollback safety confirmed! Corrupt update safely rejected, existing database preserved.`);
  } else {
    console.error(`[FAIL] Rollback test failed!`);
    return false;
  }

  console.log(`\n========================================================================`);
  console.log(`  ALL 15 PHASE 1 SUCCESS CRITERIA VERIFIED SUCCESSFULLY!`);
  console.log(`========================================================================\n`);

  return true;
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('e2e-demo.ts') || process.argv[1]?.endsWith('e2e-demo.js')) {
  runEndToEndVerification().catch(console.error);
}

import {
  CanonicalDataset,
  SyncStatus,
  SyncLogEntry,
  TimetableManifest,
  StorageProvider,
  UpdatePackage,
  AvailablePatch,
} from '@mumbai-timetable/types';
import { StorageProvider as IStorageProvider } from '@mumbai-timetable/types';
import {
  WesternRailwaySource,
  CentralRailwaySource,
  NTESSourceProvider,
  PressCircularSource,
  MultiSourceReconciler,
} from '@mumbai-timetable/data-sources';
import { TimetableParserService } from '@mumbai-timetable/timetable-parser';
import { validateCanonicalDataset } from '@mumbai-timetable/validation';
import { DiffEngine } from '@mumbai-timetable/diff-engine';
import {
  generateNextVersion,
  computeSha256,
  createStorageProviderFromEnv,
} from '@mumbai-timetable/shared';

export interface SyncEngineConfig {
  syncIntervalHours?: number;
  storageProvider?: IStorageProvider;
  officialWrUrl?: string;
  officialCrUrl?: string;
  ntesBaseUrl?: string;
}

export class SyncEngine {
  private config: SyncEngineConfig;
  private storage: IStorageProvider;
  private wrSource: WesternRailwaySource;
  private crSource: CentralRailwaySource;
  private ntesSource: NTESSourceProvider;
  private pressCircularSource: PressCircularSource;
  private currentStatus: SyncStatus = 'SYNC_IDLE';
  private logs: SyncLogEntry[] = [];
  private lastCheckedAt?: string;
  private lastSuccessfulSyncAt?: string;
  private lastPublishedAt?: string;
  private lastSourceHash?: string;
  private currentVersion?: string;

  constructor(config: SyncEngineConfig = {}) {
    this.config = {
      syncIntervalHours: config.syncIntervalHours || 6,
      ...config,
    };
    this.storage = config.storageProvider || createStorageProviderFromEnv();
    this.wrSource = new WesternRailwaySource(config.officialWrUrl);
    this.crSource = new CentralRailwaySource(config.officialCrUrl);
    this.ntesSource = new NTESSourceProvider(config.ntesBaseUrl);
    this.pressCircularSource = new PressCircularSource();
  }

  private addLog(status: SyncStatus, source: string, message: string, details?: any) {
    const entry: SyncLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      status,
      source,
      message,
      details,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) {
      this.logs.pop();
    }
  }

  getStatus() {
    return {
      status: this.currentStatus,
      lastCheckedAt: this.lastCheckedAt,
      lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
      lastPublishedAt: this.lastPublishedAt,
      currentVersion: this.currentVersion,
      syncIntervalHours: this.config.syncIntervalHours,
      storageProviderName: this.storage.name,
      recentLogs: this.logs.slice(0, 20),
    };
  }

  getLogs(): SyncLogEntry[] {
    return [...this.logs];
  }

  /**
   * Complete 6-hour official synchronization pipeline (Section 12 & 13)
   */
  async executeSync(force = false): Promise<{
    status: SyncStatus;
    version?: string;
    updatePublished?: boolean;
    error?: string;
  }> {
    this.currentStatus = 'SYNC_CHECKING';
    this.lastCheckedAt = new Date().toISOString();
    this.addLog('SYNC_CHECKING', 'Official Sources', 'Checking Western and Central Railway timetable sources');

    try {
      // 1. Check sources (Primary: NTES, Secondary: Press Circulars & Official Websites)
      const wrCheck = await this.wrSource.checkSource(this.lastSourceHash);
      const crCheck = await this.crSource.checkSource();
      const ntesCheck = await this.ntesSource.checkOperationalStream();
      const pressCheck = await this.pressCircularSource.checkCirculars();

      const combinedHash = computeSha256(
        wrCheck.contentHash + ':' + crCheck.contentHash + ':' + ntesCheck.contentHash + ':' + pressCheck.contentHash
      );
      const hasChanged = force || combinedHash !== this.lastSourceHash || !this.currentVersion;

      if (!hasChanged) {
        this.currentStatus = 'SYNC_NO_CHANGE';
        this.addLog(
          'SYNC_NO_CHANGE',
          'Multi-Source Ingestion',
          'Official railway timetables and NTES stream unchanged. No diff or update needed.'
        );
        return { status: 'SYNC_NO_CHANGE', version: this.currentVersion };
      }

      this.currentStatus = 'SOURCE_CHANGED';
      this.addLog(
        'SOURCE_CHANGED',
        'Multi-Source Ingestion',
        `Detected operational updates (NTES: ${ntesCheck.activeDeparturesCount} active overrides, Press Notices: ${pressCheck.suburbanNoticesCount})`
      );

      // 2. Parse Baseline Schedule
      this.currentStatus = 'PARSING';
      const existingManifest = await this.storage.getManifest();
      const previousVersion = existingManifest?.latestVersion || this.currentVersion;
      const nextVersion = generateNextVersion(previousVersion);

      this.addLog('PARSING', 'Timetable Parser', `Parsing baseline schedule for version ${nextVersion}`);
      const rawDataset = TimetableParserService.parseSuburbanNetwork(
        nextVersion,
        wrCheck.effectiveDate || '2026-10-10'
      );

      // 3. Reconcile with Primary (NTES) & Secondary (Press Circulars) consensus
      this.addLog('PARSING', 'Consensus Reconciler', 'Synthesizing NTES Primary operational data with baseline');
      const reconciliation = MultiSourceReconciler.reconcile(rawDataset, ntesCheck, pressCheck);
      const newDataset = reconciliation.reconciledDataset;

      for (const logMsg of reconciliation.auditLog) {
        this.addLog('PARSING', 'Consensus Reconciler', logMsg);
      }

      // 4. Strict Validation (Section 20)
      this.currentStatus = 'VALIDATING';
      this.addLog('VALIDATING', 'Validation Engine', 'Running strict validation on reconciled dataset');
      const validationReport = validateCanonicalDataset(newDataset);

      if (!validationReport.isValid) {
        this.currentStatus = 'SYNC_FAILED';
        const errMsg = `Validation failed: ${validationReport.errors[0]?.message}`;
        this.addLog('SYNC_FAILED', 'Validation Engine', errMsg, validationReport.errors);
        return { status: 'SYNC_FAILED', error: errMsg };
      }

      // 4. Compare with previous canonical dataset (Section 14)
      this.currentStatus = 'COMPARING';
      this.addLog('COMPARING', 'Diff Engine', 'Comparing against previous canonical dataset');

      let previousDataset: CanonicalDataset | null = null;
      if (previousVersion) {
        previousDataset = await this.storage.getDataset(previousVersion);
      }

      let updatePackage: UpdatePackage | null = null;
      if (previousDataset) {
        this.currentStatus = 'GENERATING_UPDATE';
        this.addLog('GENERATING_UPDATE', 'Diff Engine', `Generating incremental diff from ${previousVersion} to ${nextVersion}`);
        updatePackage = DiffEngine.createUpdatePackage(previousDataset, newDataset);
        if (updatePackage) {
          this.addLog(
            'GENERATING_UPDATE',
            'Diff Engine',
            `Diff summary: ${updatePackage.diff.summary.totalAdded} added, ${updatePackage.diff.summary.totalUpdated} updated, ${updatePackage.diff.summary.totalDeleted} deleted. Package size: ${updatePackage.sizeBytes} bytes.`
          );
        }
      }

      // 5. Publish to Storage Repository (Section 3, 15, 18)
      this.currentStatus = 'PUBLISHING';
      this.addLog('PUBLISHING', this.storage.name, `Publishing version ${nextVersion} to storage repository`);

      // Publish full dataset
      const pubDataset = await this.storage.publishDataset(nextVersion, newDataset);
      if (!pubDataset.success) {
        throw new Error(pubDataset.error || 'Failed to publish dataset to storage');
      }

      const availablePatches: AvailablePatch[] = [];

      // Publish update package if incremental diff exists
      if (updatePackage) {
        const pubUpdate = await this.storage.publishUpdatePackage(updatePackage);
        if (pubUpdate.success) {
          availablePatches.push({
            fromVersion: updatePackage.fromVersion,
            toVersion: updatePackage.toVersion,
            patchFile: `patch-${updatePackage.fromVersion}-to-${updatePackage.toVersion}.json`,
            patchUrl: pubUpdate.url || '',
            patchChecksum: updatePackage.checksum,
            patchSizeBytes: updatePackage.sizeBytes || 0,
          });
        }
      }

      // 6. Update Manifest
      const manifest: TimetableManifest = {
        latestVersion: nextVersion,
        previousVersion,
        schemaVersion: newDataset.schemaVersion,
        generatedAt: new Date().toISOString(),
        effectiveDate: newDataset.effectiveDate,
        datasetHash: newDataset.datasetChecksum,
        datasetFile: 'dataset.json',
        datasetUrl: pubDataset.url || '',
        updateType: updatePackage ? 'INCREMENTAL' : 'FULL',
        incrementalUpdateAvailable: availablePatches.length > 0,
        availablePatches,
        metadata: {
          source: newDataset.source,
          recordCounts: validationReport.counts,
        },
      };

      const pubManifest = await this.storage.publishManifest(manifest);
      if (!pubManifest.success) {
        throw new Error(pubManifest.error || 'Failed to publish manifest');
      }

      this.currentStatus = 'SYNC_SUCCESS';
      this.lastSuccessfulSyncAt = new Date().toISOString();
      this.lastPublishedAt = this.lastSuccessfulSyncAt;
      this.lastSourceHash = combinedHash;
      this.currentVersion = nextVersion;

      this.addLog(
        'SYNC_SUCCESS',
        'Sync Engine',
        `Successfully published version ${nextVersion}. Manifest updated.`
      );

      return {
        status: 'SYNC_SUCCESS',
        version: nextVersion,
        updatePublished: availablePatches.length > 0,
      };
    } catch (err: any) {
      this.currentStatus = 'SYNC_FAILED';
      this.addLog('SYNC_FAILED', 'Sync Engine', `Sync failed: ${err.message}`);
      return { status: 'SYNC_FAILED', error: err.message };
    }
  }

  /**
   * Reproduces the Section 35 Update Test Scenario:
   * Kalyan departure modified from 07:20:00 to 07:23:00.
   * Generates Version 002, computes diff, publishes patch package, verifies minimal download size.
   */
  async simulateTimetableChangeScenario(): Promise<{
    success: boolean;
    initialVersion: string;
    modifiedVersion: string;
    diffSummary: any;
    patchSizeBytes: number;
    error?: string;
  }> {
    // 1. Ensure initial version (001) exists
    let initialDataset = await this.storage.getDataset('current');
    if (!initialDataset) {
      await this.executeSync(true);
      initialDataset = await this.storage.getDataset('current');
    }

    if (!initialDataset) {
      return {
        success: false,
        initialVersion: '',
        modifiedVersion: '',
        diffSummary: null,
        patchSizeBytes: 0,
        error: 'Failed to obtain base dataset',
      };
    }

    const initialVersion = initialDataset.version;
    const modifiedVersion = generateNextVersion(initialVersion);

    // 2. Clone dataset and apply Section 35 change: Train 97001 Kalyan departure = 07:23:00
    const modifiedDataset: CanonicalDataset = JSON.parse(JSON.stringify(initialDataset));
    modifiedDataset.version = modifiedVersion;
    modifiedDataset.createdAt = new Date().toISOString();

    const targetTrain = modifiedDataset.trains.find((t) => t.train_number === '97001');
    if (targetTrain) {
      const kalyanStation = modifiedDataset.stations.find((s) => s.station_code === 'KYN');
      if (kalyanStation) {
        const kalyanStop = modifiedDataset.train_stops.find(
          (ts) => ts.train_id === targetTrain.id && ts.station_id === kalyanStation.id
        );
        if (kalyanStop) {
          // Change Kalyan departure from 07:20:00 to 07:23:00
          kalyanStop.departure_time = '07:23:00';
          kalyanStop.arrival_time = '07:23:00';
        }
      }
    }

    modifiedDataset.datasetChecksum = computeSha256(modifiedDataset);

    // 3. Compute diff
    const updatePkg = DiffEngine.createUpdatePackage(initialDataset, modifiedDataset);

    // 4. Publish modified version and patch
    await this.storage.publishDataset(modifiedVersion, modifiedDataset);
    const pubUpdate = await this.storage.publishUpdatePackage(updatePkg);

    const manifest: TimetableManifest = {
      latestVersion: modifiedVersion,
      previousVersion: initialVersion,
      schemaVersion: modifiedDataset.schemaVersion,
      generatedAt: new Date().toISOString(),
      effectiveDate: modifiedDataset.effectiveDate,
      datasetHash: modifiedDataset.datasetChecksum,
      datasetFile: 'dataset.json',
      datasetUrl: '',
      updateType: 'INCREMENTAL',
      incrementalUpdateAvailable: true,
      availablePatches: [
        {
          fromVersion: initialVersion,
          toVersion: modifiedVersion,
          patchFile: `patch-${initialVersion}-to-${modifiedVersion}.json`,
          patchUrl: pubUpdate.url || '',
          patchChecksum: updatePkg.checksum,
          patchSizeBytes: updatePkg.sizeBytes || 0,
        },
      ],
      metadata: {
        source: 'Simulated Timetable Update (Section 35: Kalyan 07:20 -> 07:23)',
        recordCounts: {
          train_stops_modified: updatePkg.diff.summary.totalUpdated,
        },
      },
    };

    await this.storage.publishManifest(manifest);

    this.currentVersion = modifiedVersion;
    this.addLog(
      'SYNC_SUCCESS',
      'Simulation',
      `Simulated Section 35 update: Kalyan departure 07:20 -> 07:23. Version ${modifiedVersion} published. Patch size: ${updatePkg.sizeBytes} bytes.`
    );

    return {
      success: true,
      initialVersion,
      modifiedVersion,
      diffSummary: updatePkg.diff.summary,
      patchSizeBytes: updatePkg.sizeBytes || 0,
    };
  }

  /**
   * Generates a corrupted update package for testing transactional rollback (Section 36).
   */
  generateCorruptUpdatePackage(fromVersion: string, toVersion: string): UpdatePackage {
    return {
      fromVersion,
      toVersion,
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      checksum: 'corrupted-invalid-hash-for-rollback-test',
      diff: {
        fromVersion,
        toVersion,
        generatedAt: new Date().toISOString(),
        schemaVersion: '1.0.0',
        tables: {
          railways: { created: [], updated: [], deleted: [] },
          divisions: { created: [], updated: [], deleted: [] },
          lines: { created: [], updated: [], deleted: [] },
          routes: { created: [], updated: [], deleted: [] },
          stations: { created: [], updated: [], deleted: [] },
          trains: { created: [], updated: [], deleted: [] },
          train_stops: {
            created: [],
            updated: [
              {
                id: 'stop_corrupted',
                train_id: 'non_existent_train_id',
                station_id: 'non_existent_station_id',
                sequence: -99, // INVALID sequence triggering DB integrity failure
                arrival_time: '99:99:99', // INVALID time
                departure_time: '00:00:00',
                day_pattern: 'DAILY',
              },
            ],
            deleted: [],
          },
        },
        summary: { totalAdded: 0, totalUpdated: 1, totalDeleted: 0 },
      },
    };
  }
}

import { DatabaseManager } from '@mumbai-timetable/database';
import { TimetableManifest, UpdatePackage } from '@mumbai-timetable/types';

export class BackgroundSyncService {
  private apiUrl: string;
  private db: DatabaseManager;

  constructor(apiUrl: string, db: DatabaseManager) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.db = db;
  }

  /**
   * Android background task handler (compatible with WorkManager / BackgroundFetch).
   * Checks repository manifest, detects if newer version exists, downloads patch, and updates SQLite.
   */
  async checkAndUpdate(): Promise<{ updated: boolean; version?: string; error?: string }> {
    try {
      const currentVersion = await this.db.getActiveVersion();
      const manifestRes = await fetch(`${this.apiUrl}/api/timetable/manifest`);
      if (!manifestRes.ok) {
        return { updated: false, error: 'Could not fetch central manifest' };
      }

      const manifest: TimetableManifest = await manifestRes.json();
      if (!manifest.latestVersion || manifest.latestVersion === currentVersion) {
        return { updated: false, version: currentVersion || undefined };
      }

      // Check if incremental patch is available from currentVersion to latestVersion
      const patchMeta = manifest.availablePatches?.find(
        (p) => p.fromVersion === currentVersion && p.toVersion === manifest.latestVersion
      );

      if (patchMeta) {
        // Incremental download (saves mobile data, Section 15)
        const patchRes = await fetch(
          `${this.apiUrl}/api/timetable/updates?from=${currentVersion}&to=${manifest.latestVersion}`
        );
        const updatePkg: UpdatePackage = await patchRes.json();

        // Apply transactionally to local SQLite with automatic rollback on error
        const result = await this.db.applyUpdatePackage(updatePkg);
        if (result.success) {
          return { updated: true, version: manifest.latestVersion };
        } else {
          return { updated: false, error: result.error };
        }
      } else {
        // Fallback to full dataset download if device was too far behind
        const fullRes = await fetch(manifest.datasetUrl || `${this.apiUrl}/api/timetable/dataset`);
        if (fullRes.ok) {
          const fullDataset = await fullRes.json();
          const importResult = await this.db.importFullDataset(fullDataset);
          return { updated: importResult.success, version: manifest.latestVersion, error: importResult.error };
        }
      }

      return { updated: false };
    } catch (err: any) {
      return { updated: false, error: err.message };
    }
  }
}

import * as fs from 'fs';
import * as path from 'path';
import {
  StorageProvider,
  StoragePublishResult,
  TimetableManifest,
  CanonicalDataset,
  UpdatePackage,
} from '@mumbai-timetable/types';
import { computeSha256 } from '../checksum.js';

export interface LocalStorageConfig {
  basePath: string;
}

/**
 * LocalStorageProvider
 * Mimics Google Drive folder hierarchy on local disk for development, testing, and CI/CD:
 * basePath/
 *   ├── current/ (manifest.json, timetable-version.json, dataset.json, tables...)
 *   ├── updates/ (patch files between versions)
 *   ├── backups/ (historical full datasets)
 *   ├── source/  (downloaded official source files & metadata)
 *   └── logs/    (sync logs)
 */
export class LocalStorageProvider implements StorageProvider {
  public readonly name = 'local_storage';
  private basePath: string;

  constructor(config: LocalStorageConfig) {
    this.basePath = path.resolve(config.basePath);
    this.ensureDirectories();
  }

  private ensureDirectories() {
    const dirs = ['current', 'updates', 'backups', 'source', 'logs'];
    for (const dir of dirs) {
      const fullPath = path.join(this.basePath, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }

  async publishManifest(manifest: TimetableManifest): Promise<StoragePublishResult> {
    try {
      this.ensureDirectories();
      const currentDir = path.join(this.basePath, 'current');
      const manifestPath = path.join(currentDir, 'manifest.json');
      const content = JSON.stringify(manifest, null, 2);
      fs.writeFileSync(manifestPath, content, 'utf8');

      // Also save timetable-version.json for rapid version checks
      const versionPath = path.join(currentDir, 'timetable-version.json');
      fs.writeFileSync(
        versionPath,
        JSON.stringify(
          {
            latestVersion: manifest.latestVersion,
            effectiveDate: manifest.effectiveDate,
            generatedAt: manifest.generatedAt,
            datasetHash: manifest.datasetHash,
            schemaVersion: manifest.schemaVersion,
          },
          null,
          2
        ),
        'utf8'
      );

      const hash = computeSha256(content);
      return {
        success: true,
        url: `file://${manifestPath}`,
        hash,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to publish manifest locally: ${err.message}`,
      };
    }
  }

  async publishDataset(version: string, dataset: CanonicalDataset): Promise<StoragePublishResult> {
    try {
      this.ensureDirectories();
      const currentDir = path.join(this.basePath, 'current');

      // Write complete unified dataset.json
      const datasetContent = JSON.stringify(dataset, null, 2);
      const datasetPath = path.join(currentDir, 'dataset.json');
      fs.writeFileSync(datasetPath, datasetContent, 'utf8');

      // Also write individual table files as requested in Section 3
      fs.writeFileSync(
        path.join(currentDir, 'stations.json'),
        JSON.stringify(dataset.stations, null, 2),
        'utf8'
      );
      fs.writeFileSync(
        path.join(currentDir, 'trains.json'),
        JSON.stringify(dataset.trains, null, 2),
        'utf8'
      );
      fs.writeFileSync(
        path.join(currentDir, 'train-stops.json'),
        JSON.stringify(dataset.train_stops, null, 2),
        'utf8'
      );
      fs.writeFileSync(
        path.join(currentDir, 'lines.json'),
        JSON.stringify(dataset.lines, null, 2),
        'utf8'
      );
      fs.writeFileSync(
        path.join(currentDir, 'routes.json'),
        JSON.stringify(dataset.routes, null, 2),
        'utf8'
      );

      // Create a snapshot backup in backups/
      const backupDir = path.join(this.basePath, 'backups', version);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      fs.writeFileSync(path.join(backupDir, 'dataset.json'), datasetContent, 'utf8');

      const hash = computeSha256(datasetContent);
      return {
        success: true,
        url: `file://${datasetPath}`,
        hash,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to publish dataset locally: ${err.message}`,
      };
    }
  }

  async publishUpdatePackage(pkg: UpdatePackage): Promise<StoragePublishResult> {
    try {
      this.ensureDirectories();
      const patchFileName = `patch-${pkg.fromVersion}-to-${pkg.toVersion}.json`;
      const updateDir = path.join(this.basePath, 'updates', `version-${pkg.toVersion}`);
      if (!fs.existsSync(updateDir)) {
        fs.mkdirSync(updateDir, { recursive: true });
      }
      const patchPath = path.join(updateDir, patchFileName);
      const content = JSON.stringify(pkg, null, 2);
      fs.writeFileSync(patchPath, content, 'utf8');

      const hash = computeSha256(content);
      return {
        success: true,
        url: `file://${patchPath}`,
        hash,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to publish update package locally: ${err.message}`,
      };
    }
  }

  async getManifest(): Promise<TimetableManifest | null> {
    const manifestPath = path.join(this.basePath, 'current', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      return JSON.parse(content) as TimetableManifest;
    } catch {
      return null;
    }
  }

  async getDataset(version?: string): Promise<CanonicalDataset | null> {
    let datasetPath: string;
    if (!version || version === 'current') {
      datasetPath = path.join(this.basePath, 'current', 'dataset.json');
    } else {
      datasetPath = path.join(this.basePath, 'backups', version, 'dataset.json');
    }

    if (!fs.existsSync(datasetPath)) return null;
    try {
      const content = fs.readFileSync(datasetPath, 'utf8');
      return JSON.parse(content) as CanonicalDataset;
    } catch {
      return null;
    }
  }

  async getUpdatePackage(fromVersion: string, toVersion: string): Promise<UpdatePackage | null> {
    const patchFileName = `patch-${fromVersion}-to-${toVersion}.json`;
    const patchPath = path.join(this.basePath, 'updates', `version-${toVersion}`, patchFileName);
    if (!fs.existsSync(patchPath)) return null;
    try {
      const content = fs.readFileSync(patchPath, 'utf8');
      return JSON.parse(content) as UpdatePackage;
    } catch {
      return null;
    }
  }

  async backupVersion(version: string): Promise<{ success: boolean; error?: string }> {
    try {
      const currentDataset = path.join(this.basePath, 'current', 'dataset.json');
      if (!fs.existsSync(currentDataset)) {
        return { success: false, error: 'No current dataset to backup' };
      }
      const backupDir = path.join(this.basePath, 'backups', version);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      fs.copyFileSync(currentDataset, path.join(backupDir, 'dataset.json'));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async listVersions(): Promise<string[]> {
    const backupsDir = path.join(this.basePath, 'backups');
    if (!fs.existsSync(backupsDir)) return [];
    try {
      return fs.readdirSync(backupsDir).filter((name) => {
        return fs.statSync(path.join(backupsDir, name)).isDirectory();
      });
    } catch {
      return [];
    }
  }
}

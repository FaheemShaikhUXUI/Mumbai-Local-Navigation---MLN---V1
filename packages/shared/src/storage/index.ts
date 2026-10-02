import { StorageProvider } from '@mumbai-timetable/types';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { GoogleDriveStorageProvider } from './GoogleDriveStorageProvider.js';
import { S3StorageProvider } from './S3StorageProvider.js';

export { StorageProvider } from '@mumbai-timetable/types';
export * from './LocalStorageProvider.js';
export * from './GoogleDriveStorageProvider.js';
export * from './S3StorageProvider.js';

/**
 * Creates the appropriate storage provider based on environment variables.
 */
export function createStorageProviderFromEnv(env: Record<string, string | undefined> = process.env): StorageProvider {
  const providerType = (env.STORAGE_PROVIDER || 'local').toLowerCase();

  switch (providerType) {
    case 'google_drive':
      return new GoogleDriveStorageProvider({
        repositoryId: env.GOOGLE_DRIVE_REPOSITORY_ID,
        baseFolder: env.GOOGLE_DRIVE_BASE_FOLDER,
        serviceAccountEmail: env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL,
        privateKey: env.GOOGLE_DRIVE_PRIVATE_KEY,
      });

    case 's3':
      return new S3StorageProvider({
        bucket: env.S3_BUCKET,
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        publicCdnUrl: env.PUBLIC_CDN_URL,
      });

    case 'local':
    default:
      return new LocalStorageProvider({
        basePath: env.LOCAL_STORAGE_BASE_PATH || './storage/google-drive-mock',
      });
  }
}

import type { IncomingMessage, ServerResponse } from 'http';
import { createStorageProviderFromEnv } from '@mumbai-timetable/shared';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');

  try {
    const storage = createStorageProviderFromEnv();
    const manifest = await storage.getManifest();

    if (!manifest) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'No timetable published yet' }));
      return;
    }

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        latestVersion: manifest.latestVersion,
        effectiveDate: manifest.effectiveDate,
        generatedAt: manifest.generatedAt,
        datasetHash: manifest.datasetHash,
        schemaVersion: manifest.schemaVersion,
        incrementalUpdateAvailable: manifest.incrementalUpdateAvailable,
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

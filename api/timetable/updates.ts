import type { IncomingMessage, ServerResponse } from 'http';
import { createStorageProviderFromEnv } from '@mumbai-timetable/shared';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const fromVersion = url.searchParams.get('from');
  const toVersion = url.searchParams.get('to');

  if (!fromVersion || !toVersion) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Missing required query parameters 'from' and 'to'" }));
    return;
  }

  try {
    const storage = createStorageProviderFromEnv();
    const pkg = await storage.getUpdatePackage(fromVersion, toVersion);

    if (!pkg) {
      res.statusCode = 404;
      res.end(
        JSON.stringify({
          error: `No patch package available from ${fromVersion} to ${toVersion}. Fallback to full dataset recommended.`,
          fullDatasetRequired: true,
        })
      );
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify(pkg));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

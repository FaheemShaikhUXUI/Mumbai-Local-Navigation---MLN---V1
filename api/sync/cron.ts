import type { IncomingMessage, ServerResponse } from 'http';
import { SyncEngine } from '@mumbai-timetable/sync-engine';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

  // Verify authentication or Vercel Cron signature
  const authHeader = req.headers['authorization'];
  const cronHeader = req.headers['x-vercel-cron'];
  const adminSecret = process.env.ADMIN_AUTH_SECRET || 'dev-admin-secret';

  const isAuthorized =
    cronHeader === '1' ||
    (authHeader && authHeader.replace(/^Bearer\s+/i, '') === adminSecret) ||
    process.env.NODE_ENV !== 'production';

  if (!isAuthorized) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Unauthorized. Supply valid Admin Bearer token.' }));
    return;
  }

  try {
    const syncEngine = new SyncEngine();
    const result = await syncEngine.executeSync(false);

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        success: result.status !== 'SYNC_FAILED',
        status: result.status,
        version: result.version,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

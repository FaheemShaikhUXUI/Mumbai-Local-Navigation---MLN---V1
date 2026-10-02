import type { IncomingMessage, ServerResponse } from 'http';
import { SyncEngine } from '@mumbai-timetable/sync-engine';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const syncEngine = new SyncEngine();
    const status = syncEngine.getStatus();
    res.statusCode = 200;
    res.end(JSON.stringify(status, null, 2));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

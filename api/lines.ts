import type { IncomingMessage, ServerResponse } from 'http';
import { DatabaseManager } from '@mumbai-timetable/database';
import { LineExplorer } from '@mumbai-timetable/search';
import { createStorageProviderFromEnv } from '@mumbai-timetable/shared';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const storage = createStorageProviderFromEnv();
    const dataset = await storage.getDataset('current');
    if (!dataset) {
      res.statusCode = 404;
      res.end(JSON.stringify([]));
      return;
    }

    const db = new DatabaseManager();
    await db.initializeDatabase();
    await db.importFullDataset(dataset);

    const lineExplorer = new LineExplorer(db.getAdapter());
    const lines = await lineExplorer.getAllLines();

    res.statusCode = 200;
    res.end(JSON.stringify(lines));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

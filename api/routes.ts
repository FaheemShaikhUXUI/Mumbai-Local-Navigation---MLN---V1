import type { IncomingMessage, ServerResponse } from 'http';
import { DatabaseManager } from '@mumbai-timetable/database';
import { TrainSearchEngine } from '@mumbai-timetable/search';
import { createStorageProviderFromEnv } from '@mumbai-timetable/shared';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const trainId = url.searchParams.get('trainId');

  if (!trainId) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Missing required query parameter 'trainId'" }));
    return;
  }

  try {
    const storage = createStorageProviderFromEnv();
    const dataset = await storage.getDataset('current');
    if (!dataset) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Timetable database not initialized' }));
      return;
    }

    const db = new DatabaseManager();
    await db.initializeDatabase();
    await db.importFullDataset(dataset);

    const trainSearch = new TrainSearchEngine(db.getAdapter());
    const details = await trainSearch.getTrainRouteDetails(trainId);

    if (!details) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `Train '${trainId}' not found` }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify(details));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

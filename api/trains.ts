import type { IncomingMessage, ServerResponse } from 'http';
import { DatabaseManager } from '@mumbai-timetable/database';
import { TrainSearchEngine } from '@mumbai-timetable/search';
import { createStorageProviderFromEnv } from '@mumbai-timetable/shared';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const direction = url.searchParams.get('direction');
  const lineId = url.searchParams.get('lineId') || undefined;
  const corridor = url.searchParams.get('corridor') || undefined;
  const trainType = (url.searchParams.get('type') || 'ALL') as any;

  if (!from || (!to && !direction)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Missing required query parameters 'from' and ('to' or 'direction')" }));
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
    let trains: any[] = [];
    if (direction) {
      trains = await trainSearch.findTrainsInDirection(from, direction, {
        lineId,
        corridor,
        trainType,
      });
    } else if (to) {
      trains = await trainSearch.findTrainsBetweenStations(from, to, {
        lineId,
        trainType,
      });
    }

    res.statusCode = 200;
    res.end(JSON.stringify(trains));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

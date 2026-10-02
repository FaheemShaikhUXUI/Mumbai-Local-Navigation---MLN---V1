import type { IncomingMessage, ServerResponse } from 'http';
import { DatabaseManager } from '@mumbai-timetable/database';
import { StationSearchEngine } from '@mumbai-timetable/search';
import { createStorageProviderFromEnv } from '@mumbai-timetable/shared';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const query = url.searchParams.get('q') || '';
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

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

    const searchEngine = new StationSearchEngine(db.getAdapter());
    if (query) {
      const results = await searchEngine.search(query, limit);
      res.statusCode = 200;
      res.end(JSON.stringify(results));
    } else {
      const allStations = await searchEngine.loadStations();
      res.statusCode = 200;
      res.end(JSON.stringify(allStations));
    }
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

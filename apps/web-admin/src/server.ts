import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { SyncEngine } from '@mumbai-timetable/sync-engine';
import { DatabaseManager } from '@mumbai-timetable/database';
import { createStorageProviderFromEnv } from '@mumbai-timetable/shared';
import { StationSearchEngine, TrainSearchEngine, LineExplorer } from '@mumbai-timetable/search';

const PORT = parseInt(process.env.PORT || '3000', 10);
const syncEngine = new SyncEngine();

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    // 1. API: /api/timetable/version
    if (pathname === '/api/timetable/version') {
      const storage = createStorageProviderFromEnv();
      const manifest = await storage.getManifest();
      res.setHeader('Content-Type', 'application/json');
      if (!manifest) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'No timetable published yet' }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify(manifest));
      return;
    }

    // 2. API: /api/timetable/manifest
    if (pathname === '/api/timetable/manifest') {
      const storage = createStorageProviderFromEnv();
      const manifest = await storage.getManifest();
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(manifest || {}));
      return;
    }

    // 3. API: /api/sync/status
    if (pathname === '/api/sync/status') {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(syncEngine.getStatus()));
      return;
    }

    // 4. API: /api/sync/trigger
    if (pathname === '/api/sync/trigger' && req.method === 'POST') {
      const result = await syncEngine.executeSync(true);
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(result));
      return;
    }

    // 5. API: /api/sync/simulate
    if (pathname === '/api/sync/simulate' && req.method === 'POST') {
      const sim = await syncEngine.simulateTimetableChangeScenario();
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(sim));
      return;
    }

    // 6. API: /api/sync/rollback-test
    if (pathname === '/api/sync/rollback-test' && req.method === 'POST') {
      const db = new DatabaseManager();
      await db.initializeDatabase();
      const storage = createStorageProviderFromEnv();
      const dataset = await storage.getDataset('current');
      if (dataset) {
        await db.importFullDataset(dataset);
        const curVer = await db.getActiveVersion();
        const corruptPkg = syncEngine.generateCorruptUpdatePackage(curVer!, '2026.99.99.999');
        const testResult = await db.applyUpdatePackage(corruptPkg);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            testResult,
            activeVersionAfterTest: await db.getActiveVersion(),
            preserved: (await db.getActiveVersion()) === curVer,
          })
        );
        return;
      }
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'No dataset to test rollback with' }));
      return;
    }

    // 7. API: /api/stations
    if (pathname === '/api/stations') {
      const query = parsedUrl.searchParams.get('q') || '';
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
      const search = new StationSearchEngine(db.getAdapter());
      const results = query ? await search.search(query, 20) : await search.loadStations();
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(results));
      return;
    }

    // 8. API: /api/trains
    if (pathname === '/api/trains') {
      const from = parsedUrl.searchParams.get('from');
      const to = parsedUrl.searchParams.get('to');
      const type = (parsedUrl.searchParams.get('type') || 'ALL') as any;

      if (!from || !to) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Missing from or to' }));
        return;
      }

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

      const trainSearch = new TrainSearchEngine(db.getAdapter());
      const results = await trainSearch.findTrainsBetweenStations(from, to, { trainType: type });

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(results));
      return;
    }

    // 9. API: /api/routes
    if (pathname === '/api/routes') {
      const trainId = parsedUrl.searchParams.get('trainId');
      if (!trainId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Missing trainId' }));
        return;
      }
      const storage = createStorageProviderFromEnv();
      const dataset = await storage.getDataset('current');
      if (!dataset) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'No dataset' }));
        return;
      }
      const db = new DatabaseManager();
      await db.initializeDatabase();
      await db.importFullDataset(dataset);

      const trainSearch = new TrainSearchEngine(db.getAdapter());
      const details = await trainSearch.getTrainRouteDetails(trainId);
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(details));
      return;
    }

    // 10. API: /api/lines
    if (pathname === '/api/lines') {
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
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(lines));
      return;
    }

    // Static Assets serving
    let filePath = path.join(__dirname, '..', 'public', pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
    if (pathname === '/mobile') {
      filePath = path.join(__dirname, '..', 'public', 'mobile.html');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      res.statusCode = 200;
      res.end(fs.readFileSync(filePath));
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  MUMBAI LOCAL APPLICATION SERVER RUNNING`);
  console.log(`  Admin Dashboard:   http://localhost:${PORT}/`);
  console.log(`  Mobile App View:   http://localhost:${PORT}/mobile`);
  console.log(`  API Status:        http://localhost:${PORT}/api/sync/status`);
  console.log(`======================================================\n`);
});

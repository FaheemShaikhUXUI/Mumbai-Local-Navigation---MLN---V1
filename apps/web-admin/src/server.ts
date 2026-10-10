import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { SyncEngine } from '@mumbai-timetable/sync-engine';
import { DatabaseManager } from '@mumbai-timetable/database';
import { createStorageProviderFromEnv, CrowdEngine } from '@mumbai-timetable/shared';
import { StationSearchEngine, TrainSearchEngine, LineExplorer } from '@mumbai-timetable/search';

const PORT = parseInt(process.env.PORT || '3000', 10);
const syncEngine = new SyncEngine();
const crowdEngine = new CrowdEngine();

let cachedDb: DatabaseManager | null = null;
let cachedVersion: string | null = null;

async function getOrInitDb(): Promise<DatabaseManager | null> {
  const storage = createStorageProviderFromEnv();
  const manifest = await storage.getManifest();
  const curVer = manifest?.latestVersion || 'current';
  if (cachedDb && cachedVersion === curVer) {
    return cachedDb;
  }
  const dataset = await storage.getDataset('current');
  if (!dataset) return null;
  const db = new DatabaseManager();
  await db.initializeDatabase();
  await db.importFullDataset(dataset);
  cachedDb = db;
  cachedVersion = curVer;
  return cachedDb;
}

interface CrowdLiveReport {
  trainKey: string;
  trainId?: string;
  trainNumber?: string;
  isActive: boolean;
  isUserInside: boolean;
  delayMinutes: number;
  latitude?: number;
  longitude?: number;
  speed?: number;
  currentStation?: string;
  updatedAt: number;
}

const crowdReportsMap = new Map<string, CrowdLiveReport>();

function purgeExpiredReports() {
  const now = Date.now();
  for (const [key, rep] of crowdReportsMap.entries()) {
    if (now - rep.updatedAt > 45 * 60 * 1000) {
      crowdReportsMap.delete(key);
    }
  }
}

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
      cachedDb = null;
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(result));
      return;
    }

    // 5. API: /api/sync/simulate
    if (pathname === '/api/sync/simulate' && req.method === 'POST') {
      const sim = await syncEngine.simulateTimetableChangeScenario();
      cachedDb = null;
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
      const db = await getOrInitDb();
      if (!db) {
        res.statusCode = 404;
        res.end(JSON.stringify([]));
        return;
      }
      const search = new StationSearchEngine(db.getAdapter());
      const results = query ? await search.search(query, 20) : await search.loadStations();
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(results));
      return;
    }

    // 8. API: /api/trains?from=stn_dr&to=stn_vr OR /api/trains?from=stn_dr&direction=DN&lineId=line_wr_suburban
    if (pathname === '/api/trains') {
      const from = parsedUrl.searchParams.get('from');
      const to = parsedUrl.searchParams.get('to');
      const direction = parsedUrl.searchParams.get('direction');
      const lineId = parsedUrl.searchParams.get('lineId') || undefined;
      const corridor = parsedUrl.searchParams.get('corridor') || undefined;
      const type = (parsedUrl.searchParams.get('type') || 'ALL') as any;

      if (!from || (!to && !direction)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Missing from or (to/direction)' }));
        return;
      }

      const db = await getOrInitDb();
      if (!db) {
        res.statusCode = 404;
        res.end(JSON.stringify([]));
        return;
      }

      const trainSearch = new TrainSearchEngine(db.getAdapter());
      let results: any[] = [];
      if (direction) {
        results = await trainSearch.findTrainsInDirection(from, direction, {
          lineId,
          corridor,
          trainType: type,
        });
      } else if (to) {
        results = await trainSearch.findTrainsBetweenStations(from, to, {
          lineId,
          trainType: type,
        });
      }

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
      const db = await getOrInitDb();
      if (!db) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'No dataset' }));
        return;
      }

      const trainSearch = new TrainSearchEngine(db.getAdapter());
      const details = await trainSearch.getTrainRouteDetails(trainId);
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(details));
      return;
    }

    // 10. API: /api/lines
    if (pathname === '/api/lines') {
      const db = await getOrInitDb();
      if (!db) {
        res.statusCode = 404;
        res.end(JSON.stringify([]));
        return;
      }

      const lineExplorer = new LineExplorer(db.getAdapter());
      const lines = await lineExplorer.getAllLines();
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(lines));
      return;
    }

    // 10.5. API: /api/trains/live-reports & /api/trains/live-report (Phase 1 & 2 Live Crowdsourced Tracking)
    if (pathname === '/api/trains/live-reports' && req.method === 'GET') {
      purgeExpiredReports();
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, reports: Object.fromEntries(crowdReportsMap) }));
      return;
    }

    if (pathname === '/api/trains/live-report' && req.method === 'POST') {
      let bodyStr = '';
      req.on('data', (chunk) => { bodyStr += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(bodyStr || '{}');
          const { trainKey, report } = payload;
          if (trainKey) {
            if (report && report.isActive) {
              crowdReportsMap.set(trainKey, {
                ...report,
                updatedAt: Date.now()
              });
            } else {
              crowdReportsMap.delete(trainKey);
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, activeCount: crowdReportsMap.size }));
        } catch (e: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // 10.6. API: Dynamic GPS-Based Train Crowd Strength Endpoints
    if (pathname === '/api/crowd/estimate' && req.method === 'GET') {
      const trainKey = parsedUrl.searchParams.get('trainKey') || 'UNKNOWN';
      const trainId = parsedUrl.searchParams.get('trainId') || undefined;
      const trainNumber = parsedUrl.searchParams.get('trainNumber') || undefined;
      const departureTime = parsedUrl.searchParams.get('departureTime') || '10:18:00';
      const isFast = parsedUrl.searchParams.get('isFast') === 'true';
      const isAc = parsedUrl.searchParams.get('isAc') === 'true';
      const direction = (parsedUrl.searchParams.get('direction') as 'UP' | 'DN') || 'DN';

      const estimate = crowdEngine.getEstimate(trainKey, {
        trainKey,
        trainId,
        trainNumber,
        departureTime,
        isFast,
        isAc,
        direction
      });

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(estimate));
      return;
    }

    if (pathname === '/api/crowd/observe' && req.method === 'POST') {
      let bodyStr = '';
      req.on('data', (chunk) => { bodyStr += chunk; });
      req.on('end', () => {
        try {
          const obs = JSON.parse(bodyStr || '{}');
          const result = crowdEngine.recordObservation(obs);

          if (obs.trainKey && obs.isUserInside) {
            crowdReportsMap.set(obs.trainKey, {
              trainKey: obs.trainKey,
              trainId: obs.trainId,
              isActive: true,
              isUserInside: true,
              delayMinutes: obs.delayMinutes || 0,
              latitude: obs.latitude,
              longitude: obs.longitude,
              speed: obs.speed,
              updatedAt: Date.now()
            });
          }

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = result.success ? 200 : 400;
          res.end(JSON.stringify(result));
        } catch (e: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid observation JSON' }));
        }
      });
      return;
    }

    if (pathname === '/api/crowd/config' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({
        nominalCapacity12Car: 3500,
        nominalCapacity15Car: 4500,
        nominalCapacityAc: 1800,
        commuterSamplingMultiplier: 35,
        freshnessWindowMinutes: 15,
        minContributorsForHighConfidence: 7
      }));
      return;
    }

    // 11. Dev Version Endpoint for Instant Live-Reload / Hot CSS Injection
    if (pathname === '/api/dev/version') {
      const srcPub = path.join(process.cwd(), 'apps', 'web-admin', 'public');
      const distPub = path.join(__dirname, '..', 'public');
      const targetDir = fs.existsSync(srcPub) ? srcPub : distPub;
      let cssMtime = 0, jsMtime = 0, htmlMtime = 0;
      try {
        const cP = path.join(targetDir, 'mobile.css');
        if (fs.existsSync(cP)) cssMtime = fs.statSync(cP).mtimeMs;
        const jP = path.join(targetDir, 'mobile.js');
        if (fs.existsSync(jP)) jsMtime = fs.statSync(jP).mtimeMs;
        const hP = path.join(targetDir, 'mobile.html');
        if (fs.existsSync(hP)) htmlMtime = fs.statSync(hP).mtimeMs;
      } catch (e) {}
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.statusCode = 200;
      res.end(JSON.stringify({ cssMtime, jsMtime, htmlMtime }));
      return;
    }

    // Static Assets serving: check apps/web-admin/public FIRST so changes are 100% INSTANT!
    const srcPub = path.join(process.cwd(), 'apps', 'web-admin', 'public');
    const distPub = path.join(__dirname, '..', 'public');
    const activePub = fs.existsSync(srcPub) ? srcPub : distPub;

    let filePath = path.join(activePub, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
    if (pathname === '/mobile') {
      filePath = path.join(activePub, 'mobile.html');
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
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
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

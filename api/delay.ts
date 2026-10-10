import type { IncomingMessage, ServerResponse } from 'http';
import { DelayFusionEngine } from '@mumbai-timetable/shared';

const delayEngine = new DelayFusionEngine();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const endpoint = url.searchParams.get('endpoint') || '';
  const pathname = url.pathname;

  // 1. Layer 3 Incidents handler
  if (endpoint === 'incidents' || pathname.includes('/incidents')) {
    if (req.method === 'GET') {
      res.statusCode = 200;
      res.end(JSON.stringify({ incidents: delayEngine.getActiveIncidents() }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const inc = JSON.parse(body || '{}');
          if (inc && inc.id && inc.delayMinutes !== undefined) {
            delayEngine.addIncident({
              ...inc,
              startTime: inc.startTime || Date.now(),
              endTime: inc.endTime || (Date.now() + 3600000),
              isActive: inc.isActive !== false,
            });
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, count: delayEngine.getActiveIncidents().length }));
          } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing required incident fields (id, delayMinutes)' }));
          }
        } catch (err: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // 2. Layer 5 Passive Telemetry handler
  if (endpoint === 'passive' || pathname.includes('/telemetry')) {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const ping = JSON.parse(body || '{}');
          if (ping && ping.detectedTrainKey && ping.speed) {
            delayEngine.recordPassiveTelemetry(ping, ping.detectedDelayMinutes || 0);
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, trainKey: ping.detectedTrainKey }));
          } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing required telemetry fields' }));
          }
        } catch (err: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // 3. 6-Layer Train Delay & ETA Reach Time Estimate
  const trainKey = url.searchParams.get('trainKey') || 'UNKNOWN';
  const trainId = url.searchParams.get('trainId') || undefined;
  const trainNumber = url.searchParams.get('trainNumber') || undefined;
  const departureTime = url.searchParams.get('departureTime') || '10:00:00';
  const scheduledArrivalTime = url.searchParams.get('scheduledArrivalTime') || undefined;
  const direction = (url.searchParams.get('direction') as 'UP' | 'DN') || 'DN';
  const corridor = url.searchParams.get('corridor') || 'WR_SUBURBAN';
  const lineType = (url.searchParams.get('lineType') as 'SLOW' | 'FAST') || 'SLOW';
  const isAc = url.searchParams.get('isAc') === 'true';

  try {
    const delayResult = delayEngine.evaluateTrain({
      trainKey,
      trainId,
      trainNumber,
      departureTime,
      scheduledArrivalTime,
      direction,
      corridor,
      lineType,
      isAc,
    });

    res.statusCode = 200;
    res.end(JSON.stringify(delayResult));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

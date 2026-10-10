import type { IncomingMessage, ServerResponse } from 'http';
import { DelayFusionEngine } from '@mumbai-timetable/shared';

const delayEngine = new DelayFusionEngine();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

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
}

import type { IncomingMessage, ServerResponse } from 'http';
import { DelayFusionEngine } from '@mumbai-timetable/shared';

const delayEngine = new DelayFusionEngine();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

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
}

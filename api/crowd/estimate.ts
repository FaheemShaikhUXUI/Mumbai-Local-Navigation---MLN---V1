import type { IncomingMessage, ServerResponse } from 'http';
import { CrowdEngine } from '@mumbai-timetable/shared';

const crowdEngine = new CrowdEngine();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const trainKey = url.searchParams.get('trainKey') || 'UNKNOWN';
  const trainId = url.searchParams.get('trainId') || undefined;
  const trainNumber = url.searchParams.get('trainNumber') || undefined;
  const departureTime = url.searchParams.get('departureTime') || '10:18:00';
  const isFast = url.searchParams.get('isFast') === 'true';
  const isAc = url.searchParams.get('isAc') === 'true';
  const direction = (url.searchParams.get('direction') as 'UP' | 'DN') || 'DN';

  try {
    const estimate = crowdEngine.getEstimate(trainKey, {
      trainKey,
      trainId,
      trainNumber,
      departureTime,
      isFast,
      isAc,
      direction
    });

    res.statusCode = 200;
    res.end(JSON.stringify(estimate));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

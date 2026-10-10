import type { IncomingMessage, ServerResponse } from 'http';
import { DelayFusionEngine } from '@mumbai-timetable/shared';

const delayEngine = new DelayFusionEngine();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
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

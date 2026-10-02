import { Train, TrainStop, Route } from '@mumbai-timetable/types';

export class WesternRailwayValidator {
  static validate(routes: Route[], trains: Train[], stops: TrainStop[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (routes.length === 0) errors.push('WR validation: No routes found');
    if (trains.length === 0) errors.push('WR validation: No trains found');
    if (stops.length === 0) errors.push('WR validation: No stops found');

    const trainIds = new Set(trains.map((t) => t.id));
    for (const stop of stops) {
      if (!trainIds.has(stop.train_id)) {
        errors.push(`WR validation: Stop ${stop.id} references missing train ${stop.train_id}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

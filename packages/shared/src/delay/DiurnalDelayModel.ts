/**
 * ==============================================================================
 * LAYER 2: DIURNAL RUSH-HOUR DWELL-TIME STATISTICAL DELAY MODEL
 * ==============================================================================
 * Calibrated against Mumbai Suburban Railway traffic patterns.
 * Models organic delay accumulation resulting from extended passenger
 * boarding dwell times at major junction stations during peak crush hours.
 */

export interface TrainMetadataForDelay {
  trainKey: string;
  departureTime: string; // 'HH:MM:SS' or 'HH:MM'
  direction?: 'UP' | 'DN';
  corridor?: string;     // 'WR_SUBURBAN', 'CR_MAIN', 'CR_HARBOUR', 'CR_TRANS_HARBOUR'
  isFast?: boolean;
  isAc?: boolean;
  stopsCount?: number;
}

export class DiurnalDelayModel {
  /**
   * Calculates the predicted organic statistical delay in minutes (0 to ~8m)
   * based on diurnal peak traffic flows on Mumbai suburban lines.
   */
  public calculateDelay(meta: TrainMetadataForDelay): number {
    const depTime = meta.departureTime || '10:00:00';
    const parts = depTime.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const totalMinutes = hours * 60 + minutes;

    const direction = meta.direction || 'DN';
    const isFast = !!meta.isFast;
    const isAc = !!meta.isAc;

    let baseDelay = 0;

    // 1. Morning Peak Window (08:00 AM - 11:30 AM = 480 to 690 mins)
    // Heavy Southbound crush towards commercial hubs (Churchgate / CSMT / Lower Parel)
    if (totalMinutes >= 480 && totalMinutes < 690) {
      if (direction === 'UP') {
        // High commuter exchange at Borivali, Andheri, Bandra, Dadar, Kurla, Thane
        baseDelay = isFast ? 3.5 : 5.5;
      } else {
        // Downward reverse-flow is smoother but holds at junctions
        baseDelay = isFast ? 1.5 : 2.5;
      }
    }
    // 2. Evening Peak Window (05:00 PM - 09:30 PM = 1020 to 1290 mins)
    // Massive Northbound evening crush departing South/Central Mumbai outwards
    else if (totalMinutes >= 1020 && totalMinutes < 1290) {
      if (direction === 'DN') {
        // Extreme platform clearance dwell at Dadar, Andheri, Borivali, Thane, Kalyan
        baseDelay = isFast ? 4.5 : 7.0;
      } else {
        baseDelay = isFast ? 2.0 : 3.0;
      }
    }
    // 3. Afternoon Mini-Peak / School Rush (01:00 PM - 03:30 PM = 780 to 930 mins)
    else if (totalMinutes >= 780 && totalMinutes < 930) {
      baseDelay = isFast ? 1.0 : 2.0;
    }
    // 4. Normal Daytime Off-Peak (11:30 AM - 01:00 PM, 03:30 PM - 05:00 PM)
    else if (totalMinutes >= 420 && totalMinutes < 1380) {
      baseDelay = isFast ? 0.5 : 1.0;
    }
    // 5. Late Night & Early Morning Hiatus (10:00 PM - 07:00 AM)
    else {
      baseDelay = 0;
    }

    // AC locals have automatic pneumatic doors and regulated passenger loads (25% fewer delays)
    if (isAc) {
      baseDelay = Math.round(baseDelay * 0.75 * 10) / 10;
    }

    // Stop-count scaling: long runs accumulate slightly more dwell variation
    if (meta.stopsCount && meta.stopsCount > 15) {
      baseDelay += 0.5;
    }

    return Math.max(0, Math.round(baseDelay));
  }
}

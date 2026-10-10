import { PassiveTelemetryPing } from '@mumbai-timetable/types';

/**
 * ==============================================================================
 * LAYER 5: PASSIVE ZERO-TOUCH GPS TELEMETRY & TRACK-SNAP MATCHER
 * ==============================================================================
 * Passively identifies commuters onboard trains via velocity filtering (30-110 km/h)
 * and Mumbai Suburban railway corridor geofencing.
 * No manual button toggle or commuter action required!
 */

export interface TrackStationCoordinate {
  stationId: string;
  stationName: string;
  latitude: number;
  longitude: number;
  sequence: number;
}

export interface CandidateTrainForMatching {
  trainKey: string;
  trainNumber?: string;
  stops: Array<{
    stationId: string;
    sequence: number;
    arrivalSeconds: number;
    departureSeconds: number;
  }>;
}

export class PassiveTelemetryMatcher {
  // Approximate bounding box for Mumbai Suburban Network (Dahanu to Churchgate, Kasara/Khopoli to CSMT, Panvel to CSMT)
  private readonly MMR_BOUNDS = {
    minLat: 18.6,
    maxLat: 20.1,
    minLng: 72.7,
    maxLng: 73.5,
  };

  /**
   * Evaluates whether a raw GPS ping represents an active commuter onboard a suburban train.
   */
  public isValidTrainMovement(ping: PassiveTelemetryPing): boolean {
    if (!ping || !ping.latitude || !ping.longitude) return false;

    // 1. Geographic MMR Sanity Check
    if (
      ping.latitude < this.MMR_BOUNDS.minLat ||
      ping.latitude > this.MMR_BOUNDS.maxLat ||
      ping.longitude < this.MMR_BOUNDS.minLng ||
      ping.longitude > this.MMR_BOUNDS.maxLng
    ) {
      return false;
    }

    // 2. Velocity Threshold Check:
    // Walking: 0 - 6 km/h
    // Traffic / Auto-rickshaw in Mumbai: 10 - 25 km/h
    // Suburban EMU local train cruising: 30 - 105 km/h
    const speed = ping.speed || 0;
    if (speed < 28 || speed > 115) {
      return false;
    }

    return true;
  }

  /**
   * Matches an onboard commuter's passive GPS ping to the most probable train
   * and calculates the real-time physical delay in minutes.
   */
  public matchPingToTrain(
    ping: PassiveTelemetryPing,
    candidateTrains: CandidateTrainForMatching[],
    nearestStation: TrackStationCoordinate,
    currentServiceSeconds: number
  ): { matchedTrainKey?: string; calculatedDelayMinutes: number } {
    if (!this.isValidTrainMovement(ping) || !candidateTrains || candidateTrains.length === 0) {
      return { calculatedDelayMinutes: 0 };
    }

    let bestTrainKey: string | undefined;
    let minDiffSec = Infinity;
    let bestDelay = 0;

    for (const ct of candidateTrains) {
      const stop = ct.stops.find((s) => s.stationId === nearestStation.stationId);
      if (!stop) continue;

      // Scheduled time at this station
      const schedSec = stop.departureSeconds || stop.arrivalSeconds;
      const timeDiff = Math.abs(currentServiceSeconds - schedSec);

      // Candidate must be within a realistic operating window (+/- 25 minutes)
      if (timeDiff < 25 * 60 && timeDiff < minDiffSec) {
        minDiffSec = timeDiff;
        bestTrainKey = ct.trainKey;
        // If current time is after scheduled time, the train is running late
        bestDelay = Math.max(0, Math.round((currentServiceSeconds - schedSec) / 60));
      }
    }

    return {
      matchedTrainKey: bestTrainKey,
      calculatedDelayMinutes: bestDelay,
    };
  }
}

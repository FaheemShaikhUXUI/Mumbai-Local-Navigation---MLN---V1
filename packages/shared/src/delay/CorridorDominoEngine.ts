/**
 * ==============================================================================
 * LAYER 4: CORRIDOR DOMINO CASCADE PROPAGATION ENGINE (RAIL ABS PHYSICS)
 * ==============================================================================
 * In Automatic Block Signaling (ABS) on Mumbai Suburban lines (400m-800m signal blocks),
 * trains on the same line cannot overtake each other.
 * If Train A ahead has an established delay, the minimum safe headway (H_min = ~3.0m)
 * forces trailing trains behind it to slow down or halt at red/yellow signals.
 */

export interface DominoCandidateTrain {
  trainKey: string;
  departureSeconds: number; // In service day seconds
  establishedDelay: number; // Existing delay (from incidents, GPS, or reports)
  lineType: 'SLOW' | 'FAST';
  corridor: string;
  direction: 'UP' | 'DN';
}

export class CorridorDominoEngine {
  private minimumHeadwaySeconds: number;
  private decayFactor: number;

  constructor(minimumHeadwayMinutes: number = 3.0, decayFactor: number = 0.88) {
    this.minimumHeadwaySeconds = minimumHeadwayMinutes * 60;
    this.decayFactor = decayFactor;
  }

  /**
   * Propagates cascading delays down a sequence of trains on the same corridor line and direction.
   * Returns a map of trainKey -> dominoDelayMinutes.
   */
  public propagateQueueDelays(trains: DominoCandidateTrain[]): Map<string, number> {
    const results = new Map<string, number>();
    if (!trains || trains.length < 2) return results;

    // Group trains by corridor + lineType + direction
    const groups = new Map<string, DominoCandidateTrain[]>();
    for (const t of trains) {
      const gKey = `${t.corridor || 'WR'}_${t.lineType}_${t.direction}`;
      if (!groups.has(gKey)) {
        groups.set(gKey, []);
      }
      groups.get(gKey)!.push(t);
    }

    for (const group of groups.values()) {
      // Sort chronologically by scheduled departure time
      group.sort((a, b) => a.departureSeconds - b.departureSeconds);

      let effectiveLeadDelay = 0;
      let leadDepSec = 0;

      for (let i = 0; i < group.length; i++) {
        const current = group[i];

        if (i === 0) {
          effectiveLeadDelay = current.establishedDelay;
          leadDepSec = current.departureSeconds;
          continue;
        }

        const scheduledGapSec = current.departureSeconds - leadDepSec;

        // If the train ahead is delayed such that it blocks the minimum headway:
        if (effectiveLeadDelay > 0 && scheduledGapSec < (effectiveLeadDelay * 60 + this.minimumHeadwaySeconds)) {
          // Cascaded delay equation:
          const rawBlockSec = (effectiveLeadDelay * 60) + this.minimumHeadwaySeconds - scheduledGapSec;
          const cascadedMinutes = Math.max(0, Math.round((rawBlockSec / 60) * this.decayFactor));

          if (cascadedMinutes > 0) {
            results.set(current.trainKey, cascadedMinutes);
            // The effective delay of this train now becomes the new lead for subsequent trains
            effectiveLeadDelay = Math.max(current.establishedDelay, cascadedMinutes);
          } else {
            effectiveLeadDelay = current.establishedDelay;
          }
        } else {
          // Gap is wide enough; cascade breaks
          effectiveLeadDelay = current.establishedDelay;
        }

        leadDepSec = current.departureSeconds;
      }
    }

    return results;
  }
}

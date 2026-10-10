import {
  CrowdObservation,
  CrowdEstimate,
  CrowdState,
  CrowdConfidence,
  CrowdBaselineConfig,
  formatCrowdDisplay
} from '@mumbai-timetable/types';

export interface TrainMetadataHint {
  trainKey: string;
  trainId?: string;
  trainNumber?: string;
  lineCode?: string; // 'WR', 'CR', etc.
  direction?: 'UP' | 'DN';
  departureTime?: string; // 'HH:MM:SS' or 'HH:MM'
  isFast?: boolean;
  isAc?: boolean;
  cars?: number; // 12, 15
}

export class CrowdEngine {
  private config: CrowdBaselineConfig;
  // trainKey -> (contributorId -> CrowdObservation)
  private observationsMap: Map<string, Map<string, CrowdObservation>> = new Map();
  // Cached estimates
  private cacheMap: Map<string, { estimate: CrowdEstimate; cachedAt: number }> = new Map();

  constructor(customConfig?: Partial<CrowdBaselineConfig>) {
    this.config = {
      nominalCapacity: 3500, // Standard 12-car EMU crush load baseline
      commuterSamplingMultiplier: 35, // Statistical sampling: 1 contributor represents ~35 commuters
      freshnessWindowMs: 15 * 60 * 1000, // 15 minutes freshness window
      minContributorsForHighConfidence: 7, // 7+ independent contributors for HIGH confidence
      ...customConfig
    };
  }

  /**
   * Ingest a GPS observation with deduplication and validation.
   */
  public recordObservation(obs: CrowdObservation): { success: boolean; reason?: string } {
    if (!obs || !obs.contributorId || !obs.trainKey) {
      return { success: false, reason: 'Missing contributorId or trainKey' };
    }

    // Basic GPS sanity validation
    if (obs.latitude !== undefined && (obs.latitude < 18.0 || obs.latitude > 20.5)) {
      return { success: false, reason: 'Latitude outside Mumbai Metropolitan Region' };
    }
    if (obs.longitude !== undefined && (obs.longitude < 72.5 || obs.longitude > 73.5)) {
      return { success: false, reason: 'Longitude outside Mumbai Metropolitan Region' };
    }

    const now = Date.now();
    const timestamp = obs.timestamp || now;

    // Reject stale submissions older than freshness window
    if (now - timestamp > this.config.freshnessWindowMs) {
      return { success: false, reason: 'Observation timestamp is stale' };
    }

    if (!this.observationsMap.has(obs.trainKey)) {
      this.observationsMap.set(obs.trainKey, new Map());
    }

    const contributorMap = this.observationsMap.get(obs.trainKey)!;
    // Independent Contributor Deduplication:
    // Repeated GPS pings from the same contributorId update the observation in-place.
    contributorMap.set(obs.contributorId, {
      ...obs,
      timestamp
    });

    // Invalidate cached estimate for this train
    this.cacheMap.delete(obs.trainKey);

    return { success: true };
  }

  /**
   * Purge observations older than the freshness window across all trains.
   */
  public purgeStaleObservations(): number {
    const now = Date.now();
    let purgedCount = 0;

    for (const [trainKey, contributors] of this.observationsMap.entries()) {
      for (const [contribId, obs] of contributors.entries()) {
        if (now - obs.timestamp > this.config.freshnessWindowMs) {
          contributors.delete(contribId);
          purgedCount++;
        }
      }
      if (contributors.size === 0) {
        this.observationsMap.delete(trainKey);
      }
    }

    return purgedCount;
  }

  /**
   * Calculate dynamic crowd estimate for a train run.
   */
  public getEstimate(trainKey: string, hint?: TrainMetadataHint): CrowdEstimate {
    const now = Date.now();

    // Check recent cache (TTL 10 seconds for real-time smoothness)
    const cached = this.cacheMap.get(trainKey);
    if (cached && now - cached.cachedAt < 10000) {
      return cached.estimate;
    }

    this.purgeStaleObservations();

    const contributorMap = this.observationsMap.get(trainKey);
    const validContributors = contributorMap ? Array.from(contributorMap.values()) : [];
    const contributorCount = validContributors.length;

    // 1. Determine Capacity Baseline for Train Category
    let nominalCapacity = this.config.nominalCapacity;
    let baselineName = 'EMU_12CAR_CRUSH_3500';

    if (hint?.isAc) {
      nominalCapacity = 1800; // AC local has lower maximum capacity
      baselineName = 'AC_EMU_CAPACITY_1800';
    } else if (hint?.cars === 15) {
      nominalCapacity = 4500; // 15-car EMU
      baselineName = 'EMU_15CAR_CRUSH_4500';
    }

    // 2. Diurnal / Time-of-Day Calibrated Base
    const depTime = hint?.departureTime || '10:18:00';
    const diurnalBaseScore = this.calculateDiurnalRushScore(depTime, hint?.direction, hint?.isFast);

    let rawScore = 0;
    let confidence: CrowdConfidence = 'LOW';
    let state: CrowdState = 'AVAILABLE';
    let isStale = false;
    let lastUpdated = now;

    if (contributorCount > 0) {
      // Find latest observation timestamp
      lastUpdated = Math.max(...validContributors.map(o => o.timestamp));
      const ageMs = now - lastUpdated;
      if (ageMs > this.config.freshnessWindowMs) {
        isStale = true;
      }

      // Live GPS Contribution Component
      const liveEstimatedPassengers = contributorCount * this.config.commuterSamplingMultiplier;
      const liveCrowdPct = (liveEstimatedPassengers / nominalCapacity) * 100;

      if (contributorCount >= this.config.minContributorsForHighConfidence) {
        confidence = 'HIGH';
        // When many independent contributors corroborate, live telemetry dominates
        rawScore = Math.max(liveCrowdPct * 1.4, diurnalBaseScore * 0.3 + liveCrowdPct * 0.7);
      } else if (contributorCount >= 3) {
        confidence = 'MEDIUM';
        rawScore = diurnalBaseScore * 0.4 + liveCrowdPct * 0.6;
      } else {
        confidence = 'LOW';
        rawScore = diurnalBaseScore * 0.6 + liveCrowdPct * 0.4;
      }
    } else {
      // No live GPS contributors currently on this run:
      // Provide calibrated diurnal baseline estimate
      rawScore = diurnalBaseScore;
      confidence = 'LOW';
      state = 'AVAILABLE';
      lastUpdated = now;
    }

    // 3. Central Display Formatting
    const { displayPercentage, visualPercentage, color } = formatCrowdDisplay(rawScore);

    const estimate: CrowdEstimate = {
      trainKey,
      trainId: hint?.trainId,
      rawScore: Math.round(rawScore * 10) / 10,
      displayPercentage,
      visualPercentage,
      color,
      state,
      contributorsCount: contributorCount,
      confidence,
      baseline: baselineName,
      lastUpdated,
      isStale
    };

    this.cacheMap.set(trainKey, { estimate, cachedAt: now });
    return estimate;
  }

  /**
   * Deterministic Diurnal rush-hour curve calculation for Mumbai Suburban lines:
   * Calibrated against MMRDA commuter traffic flow patterns.
   * Can produce realistic 0% - 100%+ curves.
   */
  public calculateDiurnalRushScore(
    timeStr: string,
    direction: 'UP' | 'DN' = 'DN',
    isFast: boolean = false
  ): number {
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const totalMinutes = hours * 60 + minutes;

    let score = 25; // baseline calm off-peak score

    // Night hiatus (01:00 AM - 04:00 AM)
    if (totalMinutes >= 60 && totalMinutes < 240) {
      score = 5;
    }
    // Early morning calm (04:00 AM - 07:00 AM)
    else if (totalMinutes >= 240 && totalMinutes < 420) {
      score = 15;
    }
    // MORNING PEAK (08:00 AM - 11:30 AM):
    // Southbound (UP towards Churchgate/CSMT) sees intense super-dense crush load (100%+)
    else if (totalMinutes >= 480 && totalMinutes < 690) {
      if (direction === 'UP') {
        score = 95 + (isFast ? 18 : 6); // Easily exceeds 100% (e.g. 113% or 101%)
      } else {
        score = 45;
      }
    }
    // Midday Off-Peak (11:30 AM - 04:30 PM)
    else if (totalMinutes >= 690 && totalMinutes < 990) {
      score = 30 + (isFast ? 10 : 0);
    }
    // EVENING PEAK (05:30 PM - 09:30 PM):
    // Northbound (DN towards Borivali/Virar/Kalyan) sees massive crush load (100%+)
    else if (totalMinutes >= 1050 && totalMinutes < 1290) {
      if (direction === 'DN') {
        score = 98 + (isFast ? 22 : 8); // Exceeds 100% (e.g. 120% -> renders as 100%+)
      } else {
        score = 52;
      }
    }
    // Late Night (09:30 PM - 01:00 AM)
    else {
      score = 25;
    }

    return score;
  }

  /**
   * Clear all observations and caches.
   */
  public reset(): void {
    this.observationsMap.clear();
    this.cacheMap.clear();
  }
}

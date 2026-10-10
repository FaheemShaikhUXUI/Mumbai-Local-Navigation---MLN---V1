import {
  TrainDelayResult,
  DelaySource,
  DelayConfidence,
  CorridorIncident,
  PassiveTelemetryPing,
  LayeredDelayBreakdown,
} from '@mumbai-timetable/types';
import { DiurnalDelayModel, TrainMetadataForDelay } from './DiurnalDelayModel.js';
import { IncidentManager } from './IncidentManager.js';
import { CorridorDominoEngine, DominoCandidateTrain } from './CorridorDominoEngine.js';
import { PassiveTelemetryMatcher } from './PassiveTelemetryMatcher.js';

export interface TrainEvaluationContext {
  trainKey: string;
  trainId?: string;
  trainNumber?: string;
  departureTime: string;           // 'HH:MM:SS' at evaluated station
  scheduledArrivalTime?: string;   // 'HH:MM:SS' at terminus
  originDepartureTime?: string;    // 'HH:MM:SS' at start origin
  direction?: 'UP' | 'DN';
  corridor?: string;               // 'WR_SUBURBAN', 'CR_MAIN', 'CR_HARBOUR'
  lineType?: 'SLOW' | 'FAST';
  isAc?: boolean;
  routeStationIds?: string[];
  stopsCount?: number;
}

export class DelayFusionEngine {
  private diurnalModel: DiurnalDelayModel;
  private incidentManager: IncidentManager;
  private dominoEngine: CorridorDominoEngine;
  private telemetryMatcher: PassiveTelemetryMatcher;

  // Layer 5 Ingested passive telemetry: trainKey -> { delayMinutes, updatedAt }
  private passiveGpsMap: Map<string, { delayMinutes: number; updatedAt: number }> = new Map();

  // Layer 6 Ingested active crowd reports: trainKey -> { delayMinutes, updatedAt, count }
  private activeCrowdMap: Map<string, { delayMinutes: number; updatedAt: number; count: number }> = new Map();

  // Unified Cache: trainKey -> { result: TrainDelayResult, cachedAt: number }
  private cache: Map<string, { result: TrainDelayResult; cachedAt: number }> = new Map();

  constructor() {
    this.diurnalModel = new DiurnalDelayModel();
    this.incidentManager = new IncidentManager();
    this.dominoEngine = new CorridorDominoEngine();
    this.telemetryMatcher = new PassiveTelemetryMatcher();
  }

  // --------------------------------------------------------------------------
  // INGESTION APIS
  // --------------------------------------------------------------------------

  public addIncident(incident: CorridorIncident): void {
    this.incidentManager.addIncident(incident);
    this.cache.clear(); // Invalidate cache on new incident
  }

  public removeIncident(id: string): void {
    this.incidentManager.removeIncident(id);
    this.cache.clear();
  }

  public getActiveIncidents(): CorridorIncident[] {
    return this.incidentManager.getActiveIncidents();
  }

  public recordPassiveTelemetry(ping: PassiveTelemetryPing, detectedDelayMinutes: number): void {
    if (!ping || !ping.detectedTrainKey) return;
    this.passiveGpsMap.set(ping.detectedTrainKey, {
      delayMinutes: Math.max(0, detectedDelayMinutes),
      updatedAt: Date.now(),
    });
    this.cache.delete(ping.detectedTrainKey);
  }

  public recordActiveCrowdReport(trainKey: string, delayMinutes: number): void {
    if (!trainKey) return;
    const now = Date.now();
    const existing = this.activeCrowdMap.get(trainKey);
    this.activeCrowdMap.set(trainKey, {
      delayMinutes: Math.max(0, delayMinutes),
      updatedAt: now,
      count: (existing?.count || 0) + 1,
    });
    this.cache.delete(trainKey);
  }

  public clearActiveCrowdReport(trainKey: string): void {
    this.activeCrowdMap.delete(trainKey);
    this.cache.delete(trainKey);
  }

  // --------------------------------------------------------------------------
  // TIME UTILITIES
  // --------------------------------------------------------------------------

  private parseTimeToSeconds(timeStr: string): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return h * 3600 + m * 60 + s;
  }

  private secondsToTime(totalSec: number): string {
    const norm = (totalSec % 86400 + 86400) % 86400;
    const h = Math.floor(norm / 3600);
    const m = Math.floor((norm % 3600) / 60);
    const s = norm % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Helper to add delay minutes to any HH:MM:SS string.
   */
  public calculateEstimatedReachTime(scheduledTimeStr: string, delayMinutes: number): string {
    if (!scheduledTimeStr) return '00:00:00';
    const schedSec = this.parseTimeToSeconds(scheduledTimeStr);
    const estSec = schedSec + (delayMinutes * 60);
    return this.secondsToTime(estSec);
  }

  // --------------------------------------------------------------------------
  // MASTER 6-LAYER EVALUATION PIPELINE
  // --------------------------------------------------------------------------

  /**
   * Computes the unified 6-layer delay and estimated reach time for a single train.
   */
  public evaluateTrain(ctx: TrainEvaluationContext, cascadedDominoDelay: number = 0): TrainDelayResult {
    const now = Date.now();
    const key = ctx.trainKey;

    // Check recent cache (TTL 8 seconds for real-time responsiveness)
    const cached = this.cache.get(key);
    if (cached && (now - cached.cachedAt < 8000) && cascadedDominoDelay === 0) {
      return cached.result;
    }

    // LAYER 1: Timetable Base
    const l1_base = 0;

    // LAYER 2: Diurnal Peak Dwell Statistical Model
    const meta: TrainMetadataForDelay = {
      trainKey: ctx.trainKey,
      departureTime: ctx.departureTime,
      direction: ctx.direction || 'DN',
      corridor: ctx.corridor || 'WR_SUBURBAN',
      isFast: ctx.lineType === 'FAST',
      isAc: ctx.isAc,
      stopsCount: ctx.stopsCount,
    };
    const l2_diurnal = this.diurnalModel.calculateDelay(meta);

    // LAYER 3: Official Incident & Technical Snag Alerts
    const incRes = this.incidentManager.getIncidentDelayForTrain(
      ctx.corridor,
      ctx.direction || 'DN',
      ctx.lineType === 'FAST',
      ctx.routeStationIds || []
    );
    const l3_incident = incRes.delayMinutes;

    // LAYER 4: Automatic Block Signaling Queue Cascade
    const l4_domino = cascadedDominoDelay;

    // LAYER 5: Passive Zero-Touch GPS Telemetry
    let l5_passive = 0;
    const passiveEntry = this.passiveGpsMap.get(key);
    if (passiveEntry && (now - passiveEntry.updatedAt < 15 * 60 * 1000)) {
      l5_passive = passiveEntry.delayMinutes;
    }

    // LAYER 6: Active Commuter Beacon Reports
    let l6_active = 0;
    const activeEntry = this.activeCrowdMap.get(key);
    if (activeEntry && (now - activeEntry.updatedAt < 20 * 60 * 1000)) {
      l6_active = activeEntry.delayMinutes;
    }

    const breakdown: LayeredDelayBreakdown = {
      l1_baseScheduled: l1_base,
      l2_diurnalOffset: l2_diurnal,
      l3_incidentOffset: l3_incident,
      l4_dominoCascaded: l4_domino,
      l5_passiveGps: l5_passive,
      l6_activeCrowd: l6_active,
    };

    // ------------------------------------------------------------------------
    // FUSION ARBITRATION MATRIX:
    // Determines final authoritative delay and confidence rating.
    // ------------------------------------------------------------------------
    let finalDelay = 0;
    let source: DelaySource = 'SCHEDULED';
    let confidence: DelayConfidence = 'SCHEDULED';
    let statusDescription = 'On Time';

    // 1. Highest Priority: Live Telemetry & Verified Commuters (Layers 5 & 6)
    if (l5_passive > 0 && l6_active > 0) {
      // Both passive telemetry and active toggle agree
      finalDelay = Math.round((l5_passive * 0.6) + (l6_active * 0.4));
      source = 'PASSIVE_GPS';
      confidence = 'REALTIME_VERIFIED';
      statusDescription = `GPS Live Verified (+${finalDelay}m)`;
    } else if (l6_active > 0) {
      finalDelay = l6_active;
      source = 'ACTIVE_CROWD';
      confidence = activeEntry && activeEntry.count >= 2 ? 'CORROBORATED' : 'PREDICTED_HIGH';
      statusDescription = `Commuter Reported (+${finalDelay}m)`;
    } else if (l5_passive > 0) {
      finalDelay = l5_passive;
      source = 'PASSIVE_GPS';
      confidence = 'REALTIME_VERIFIED';
      statusDescription = `Train Telemetry (+${finalDelay}m)`;
    }
    // 2. High Priority: Official Incident Alert (Layer 3)
    else if (l3_incident > 0) {
      finalDelay = l3_incident;
      source = 'INCIDENT_ALERT';
      confidence = 'PREDICTED_HIGH';
      statusDescription = `Alert: ${incRes.incident?.title || 'Operational Notice'} (+${finalDelay}m)`;
    }
    // 3. Medium Priority: Rail ABS Headway Domino Cascade (Layer 4)
    else if (l4_domino > 0) {
      finalDelay = l4_domino;
      source = 'CORRIDOR_DOMINO';
      confidence = 'PREDICTED_HIGH';
      statusDescription = `Queue Congestion (+${finalDelay}m)`;
    }
    // 4. Baseline Intelligence: Diurnal Peak Rush Dwell Model (Layer 2)
    else if (l2_diurnal > 0) {
      finalDelay = l2_diurnal;
      source = 'DIURNAL_STATISTICAL';
      confidence = 'PREDICTED_LOW';
      statusDescription = `Peak Flow Est (+${finalDelay}m)`;
    }
    // 5. Normal Timetable
    else {
      finalDelay = 0;
      source = 'SCHEDULED';
      confidence = 'SCHEDULED';
      statusDescription = 'On Time';
    }

    const estimatedDeparture = this.calculateEstimatedReachTime(ctx.departureTime, finalDelay);
    const estimatedArrival = ctx.scheduledArrivalTime
      ? this.calculateEstimatedReachTime(ctx.scheduledArrivalTime, finalDelay)
      : undefined;

    const result: TrainDelayResult = {
      trainKey: key,
      trainId: ctx.trainId,
      trainNumber: ctx.trainNumber,
      delayMinutes: finalDelay,
      source,
      confidence,
      breakdown,
      scheduledDeparture: ctx.departureTime,
      estimatedDeparture,
      scheduledArrival: ctx.scheduledArrivalTime,
      estimatedArrival,
      statusDescription,
      updatedAt: now,
    };

    this.cache.set(key, { result, cachedAt: now });
    return result;
  }

  /**
   * Evaluates an entire corridor line's train list in one pass.
   * Runs Layer 4 Domino Propagation across all trains on the same track.
   */
  public evaluateCorridorTrains(contexts: TrainEvaluationContext[]): Map<string, TrainDelayResult> {
    const resultsMap = new Map<string, TrainDelayResult>();
    if (!contexts || contexts.length === 0) return resultsMap;

    // Step 1: Pre-evaluate individual layers (L2, L3, L5, L6) to find established lead delays
    const candidateDominoTrains: DominoCandidateTrain[] = [];

    for (const ctx of contexts) {
      const depSec = this.parseTimeToSeconds(ctx.departureTime);
      const activeCrowd = this.activeCrowdMap.get(ctx.trainKey)?.delayMinutes || 0;
      const passiveGps = this.passiveGpsMap.get(ctx.trainKey)?.delayMinutes || 0;
      const inc = this.incidentManager.getIncidentDelayForTrain(
        ctx.corridor,
        ctx.direction || 'DN',
        ctx.lineType === 'FAST',
        ctx.routeStationIds || []
      ).delayMinutes;

      // Established physical lead delay
      const established = Math.max(activeCrowd, passiveGps, inc);

      candidateDominoTrains.push({
        trainKey: ctx.trainKey,
        departureSeconds: depSec,
        establishedDelay: established,
        lineType: ctx.lineType || 'SLOW',
        corridor: ctx.corridor || 'WR_SUBURBAN',
        direction: ctx.direction || 'DN',
      });
    }

    // Step 2: Run Layer 4 Rail Queue Domino Engine
    const dominoDelays = this.dominoEngine.propagateQueueDelays(candidateDominoTrains);

    // Step 3: Run final 6-layer fusion for all trains
    for (const ctx of contexts) {
      const cascaded = dominoDelays.get(ctx.trainKey) || 0;
      const res = this.evaluateTrain(ctx, cascaded);
      resultsMap.set(ctx.trainKey, res);
    }

    return resultsMap;
  }
}

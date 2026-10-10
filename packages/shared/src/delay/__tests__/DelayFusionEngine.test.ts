import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DelayFusionEngine } from '../DelayFusionEngine.js';

describe('6-Layer Smart Train Delay & Estimated Reach Time Architecture', () => {
  test('Layer 1 & 2: Base Timetable and Diurnal Peak Dwell Prediction', () => {
    const engine = new DelayFusionEngine();

    // Morning peak Southbound (UP) slow train at 09:15 AM
    const upPeakTrain = engine.evaluateTrain({
      trainKey: 'T_VR_CCG_0915',
      departureTime: '09:15:00',
      direction: 'UP',
      corridor: 'WR_SUBURBAN',
      lineType: 'SLOW',
    });

    assert.ok(upPeakTrain.delayMinutes >= 5, 'Morning peak UP slow train should predict 5+ min organic dwell delay');
    assert.strictEqual(upPeakTrain.source, 'DIURNAL_STATISTICAL');
    assert.strictEqual(upPeakTrain.estimatedDeparture, '09:21:00'); // 09:15 + 6m

    // Late night train at 02:00 AM (Off-peak / calm)
    const nightTrain = engine.evaluateTrain({
      trainKey: 'T_VR_CCG_0200',
      departureTime: '02:00:00',
      direction: 'DN',
      corridor: 'WR_SUBURBAN',
      lineType: 'SLOW',
    });

    assert.strictEqual(nightTrain.delayMinutes, 0, 'Late night train should have 0 delay');
    assert.strictEqual(nightTrain.source, 'SCHEDULED');
  });

  test('Layer 3: Official Incident & Technical Snag Alert Ingestion', () => {
    const engine = new DelayFusionEngine();
    const now = Date.now();

    // Ingest official signal failure incident between Bandra and Andheri (+18 mins delay)
    engine.addIncident({
      id: 'INC_WR_SIGNAL_001',
      corridor: 'WR_SUBURBAN',
      sectionFromStationId: 'stn_ba',
      sectionToStationId: 'stn_adh',
      direction: 'DN',
      trackType: 'ALL',
      delayMinutes: 18,
      title: 'Signal failure between Bandra and Andheri',
      startTime: now - 5000,
      endTime: now + 3600000,
      isActive: true,
    });

    // Train passing through Bandra and Andheri
    const affectedTrain = engine.evaluateTrain({
      trainKey: 'T_CCG_VR_1100',
      departureTime: '11:00:00',
      direction: 'DN',
      corridor: 'WR_SUBURBAN',
      lineType: 'SLOW',
      routeStationIds: ['stn_ccg', 'stn_ba', 'stn_adh', 'stn_bvi'],
    });

    assert.strictEqual(affectedTrain.delayMinutes, 18, 'Train passing incident section should acquire 18 min delay');
    assert.strictEqual(affectedTrain.source, 'INCIDENT_ALERT');
    assert.strictEqual(affectedTrain.estimatedDeparture, '11:18:00');
  });

  test('Layer 4: Corridor Rail ABS Queue Headway Domino Propagation', () => {
    const engine = new DelayFusionEngine();

    // Train 1: Delayed by 15 mins (e.g. from incident or active report)
    engine.recordActiveCrowdReport('TRAIN_LEAD_1', 15);

    const corridorTrains = [
      {
        trainKey: 'TRAIN_LEAD_1',
        departureTime: '10:00:00', // 10:00
        direction: 'DN' as const,
        corridor: 'WR_SUBURBAN',
        lineType: 'SLOW' as const,
      },
      {
        trainKey: 'TRAIN_TRAILING_2',
        departureTime: '10:04:00', // Scheduled 4 mins behind lead
        direction: 'DN' as const,
        corridor: 'WR_SUBURBAN',
        lineType: 'SLOW' as const,
      },
      {
        trainKey: 'TRAIN_TRAILING_3',
        departureTime: '10:09:00', // Scheduled 9 mins behind lead
        direction: 'DN' as const,
        corridor: 'WR_SUBURBAN',
        lineType: 'SLOW' as const,
      },
    ];

    const results = engine.evaluateCorridorTrains(corridorTrains);

    const lead = results.get('TRAIN_LEAD_1');
    const trailing2 = results.get('TRAIN_TRAILING_2');
    const trailing3 = results.get('TRAIN_TRAILING_3');

    assert.ok(lead && lead.delayMinutes === 15, 'Lead train should have 15 min delay');
    assert.ok(trailing2 && trailing2.delayMinutes >= 11, 'Trailing train 2 must inherit cascaded headway delay');
    assert.strictEqual(trailing2?.source, 'CORRIDOR_DOMINO');
    assert.ok(trailing3 && trailing3.delayMinutes >= 6, 'Trailing train 3 must inherit decayed headway delay');
  });

  test('Layer 5 & 6: Passive Telemetry and Active Commuter Fusion', () => {
    const engine = new DelayFusionEngine();

    // Passive GPS telemetry detected train cruising at 65 km/h, 12 min delay
    engine.recordPassiveTelemetry(
      {
        contributorId: 'phone_commuter_abc',
        latitude: 19.2288,
        longitude: 72.8566,
        speed: 65,
        timestamp: Date.now(),
        detectedTrainKey: 'TRAIN_LIVE_88',
      },
      12
    );

    // Active commuter toggle corroboration report
    engine.recordActiveCrowdReport('TRAIN_LIVE_88', 12);

    const evalResult = engine.evaluateTrain({
      trainKey: 'TRAIN_LIVE_88',
      departureTime: '14:30:00',
      scheduledArrivalTime: '15:45:00',
      direction: 'DN',
      corridor: 'WR_SUBURBAN',
    });

    assert.strictEqual(evalResult.delayMinutes, 12);
    assert.strictEqual(evalResult.confidence, 'REALTIME_VERIFIED');
    assert.strictEqual(evalResult.estimatedDeparture, '14:42:00');
    assert.strictEqual(evalResult.estimatedArrival, '15:57:00');
  });

  test('Estimated Reach Time Calculation across Intermediate Stops', () => {
    const engine = new DelayFusionEngine();

    const est1 = engine.calculateEstimatedReachTime('07:15:00', 8);
    assert.strictEqual(est1, '07:23:00');

    const estMidnight = engine.calculateEstimatedReachTime('23:55:00', 10);
    assert.strictEqual(estMidnight, '00:05:00'); // Midnight rollover
  });
});

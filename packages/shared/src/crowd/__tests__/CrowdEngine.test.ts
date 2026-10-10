import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CrowdEngine } from '../CrowdEngine.js';
import { formatCrowdDisplay } from '@mumbai-timetable/types';

describe('Dynamic Train Crowd Strength Feature - Acceptance Tests', () => {

  describe('1. Central Percentage Display Formatting Rules', () => {
    test('Calculated 0% displays strictly as "0%" with visual width 0', () => {
      const res = formatCrowdDisplay(0);
      assert.equal(res.displayPercentage, '0%');
      assert.equal(res.visualPercentage, 0);
      assert.equal(res.color, '#38bdf8');
    });

    test('Negative score safely clamped to 0%', () => {
      const res = formatCrowdDisplay(-15);
      assert.equal(res.displayPercentage, '0%');
      assert.equal(res.visualPercentage, 0);
    });

    test('Single digit percentage displays padded "05%" as in reference image', () => {
      const res = formatCrowdDisplay(5);
      assert.equal(res.displayPercentage, '05%');
      assert.equal(res.visualPercentage, 5);
      assert.equal(res.color, '#38bdf8'); // Cyan/Blue
    });

    test('Intermediate values 25%, 50%, 75%, 86% display rounded actual percentages and match color palette', () => {
      const res25 = formatCrowdDisplay(25);
      assert.equal(res25.displayPercentage, '25%');
      assert.equal(res25.visualPercentage, 25);
      assert.equal(res25.color, '#22c55e'); // Green

      const res50 = formatCrowdDisplay(50);
      assert.equal(res50.displayPercentage, '50%');
      assert.equal(res50.visualPercentage, 50);
      assert.equal(res50.color, '#f97316'); // Amber/Orange

      const res75 = formatCrowdDisplay(75);
      assert.equal(res75.displayPercentage, '75%');
      assert.equal(res75.visualPercentage, 75);
      assert.equal(res75.color, '#ef4444'); // Red-Orange

      const res86 = formatCrowdDisplay(86.4);
      assert.equal(res86.displayPercentage, '86%');
      assert.equal(res86.visualPercentage, 86);
      assert.equal(res86.color, '#ef4444');
    });

    test('Exactly 100% displays "100%" with visual width 100', () => {
      const res = formatCrowdDisplay(100);
      assert.equal(res.displayPercentage, '100%');
      assert.equal(res.visualPercentage, 100);
      assert.equal(res.color, '#dc2626'); // Crimson Red
    });

    test('Values above 100% (105%, 125%, 180%, 250%) MUST ALL display "100%+" and NEVER raw numbers', () => {
      const testCases = [101, 105, 125, 180, 250, 400];
      for (const val of testCases) {
        const res = formatCrowdDisplay(val);
        assert.equal(res.displayPercentage, '100%+', `Failed on value ${val}`);
        assert.equal(res.visualPercentage, 100, 'Visual bar must stay at 100% and never overflow container');
        assert.equal(res.color, '#dc2626');
      }
    });
  });

  describe('2. Contributor Deduplication & Rate Limiting', () => {
    test('Repeated GPS pings from the same contributor do NOT increase contributor count', () => {
      const engine = new CrowdEngine();
      const trainKey = 'TEST_TRAIN_101';

      // Submit 5 pings from contributor user_alpha
      for (let i = 0; i < 5; i++) {
        const res = engine.recordObservation({
          contributorId: 'user_alpha',
          timestamp: Date.now() + i * 1000,
          latitude: 19.11,
          longitude: 72.86,
          speed: 40,
          trainKey,
          isUserInside: true
        });
        assert.equal(res.success, true);
      }

      const estimate = engine.getEstimate(trainKey);
      assert.equal(estimate.contributorsCount, 1, 'Same contributor pinged 5 times must count as 1');
    });

    test('Multiple distinct contributors correctly increment contributor count and confidence', () => {
      const engine = new CrowdEngine();
      const trainKey = 'TEST_TRAIN_102';

      // 8 distinct contributors
      for (let i = 1; i <= 8; i++) {
        engine.recordObservation({
          contributorId: `user_${i}`,
          timestamp: Date.now(),
          latitude: 19.12,
          longitude: 72.85,
          speed: 45,
          trainKey,
          isUserInside: true
        });
      }

      const estimate = engine.getEstimate(trainKey);
      assert.equal(estimate.contributorsCount, 8);
      assert.equal(estimate.confidence, 'HIGH');
    });
  });

  describe('3. GPS Sanity & Stale Observation Handling', () => {
    test('Rejects GPS coordinates outside Mumbai Metropolitan Region', () => {
      const engine = new CrowdEngine();
      const res = engine.recordObservation({
        contributorId: 'spoofer_1',
        timestamp: Date.now(),
        latitude: 28.6139, // New Delhi
        longitude: 77.2090,
        trainKey: 'TEST_TRAIN_103',
        isUserInside: true
      });
      assert.equal(res.success, false);
      assert.match(res.reason || '', /outside Mumbai/i);
    });

    test('Rejects stale observations older than freshness window (15 minutes)', () => {
      const engine = new CrowdEngine();
      const staleTime = Date.now() - (20 * 60 * 1000); // 20 minutes ago
      const res = engine.recordObservation({
        contributorId: 'stale_user',
        timestamp: staleTime,
        latitude: 19.11,
        longitude: 72.86,
        trainKey: 'TEST_TRAIN_104',
        isUserInside: true
      });
      assert.equal(res.success, false);
      assert.match(res.reason || '', /stale/i);
    });
  });

  describe('4. Baseline Capacity per Train Category', () => {
    test('AC train uses calibrated AC EMU baseline', () => {
      const engine = new CrowdEngine();
      const estimate = engine.getEstimate('AC_RUN_1', {
        trainKey: 'AC_RUN_1',
        departureTime: '10:18:00',
        isAc: true
      });
      assert.equal(estimate.baseline, 'AC_EMU_CAPACITY_1800');
    });

    test('15-Car train uses 15-Car EMU baseline', () => {
      const engine = new CrowdEngine();
      const estimate = engine.getEstimate('RUN_15CAR', {
        trainKey: 'RUN_15CAR',
        departureTime: '10:18:00',
        cars: 15
      });
      assert.equal(estimate.baseline, 'EMU_15CAR_CRUSH_4500');
    });
  });
});

/**
 * MUMBAI LOCAL SUPER INTELLIGENT - MOBILE APP CONTROLLER
 * Precise Implementation of User Flows:
 * 1. First Time Authentication (Splash -> Mobile Login -> OTP -> Home)
 * 2. Returning User Flow (Splash -> Home)
 * 3. Day & Night Themes (White & Purple / Black & Purple)
 * 4. Interactive "From To" Cards & Live Timetable Search
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // 1. STATE & STORAGE MANAGEMENT
  // ==========================================
  let currentTheme = localStorage.getItem('ml_theme') || 'theme-night';
  if (localStorage.getItem('ml_authenticated') === null) {
    localStorage.setItem('ml_authenticated', 'true');
  }
  let isAuthenticated = localStorage.getItem('ml_authenticated') !== 'false';
  let generatedOtp = '4821';
  let allStations = [];
  let allLines = [];
  let selectedFromStation = null;
  let selectedToStation = null;
  let activeLineFilter = 'all';

  // Screen 6 Journey and Crowdsource State
  let activeJourneyTrain = null;
  let activeJourneyTrainIdx = -1;
  let currentJourneyStops = [];
  let simulatedMinutesOffset = null; // null = Live Mumbai clock; number = manual offset in minutes for development testing

  // Accurately compute Mumbai (Asia/Kolkata / IST, UTC+5:30) time across devices
  function getMumbaiLiveDate() {
    try {
      const now = new Date();
      const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const mumbaiDate = new Date(istString);
      if (simulatedMinutesOffset !== null && !isNaN(simulatedMinutesOffset)) {
        mumbaiDate.setMinutes(mumbaiDate.getMinutes() + simulatedMinutesOffset);
      }
      return mumbaiDate;
    } catch (e) {
      return new Date();
    }
  }

  function getActiveCurrentMinutes() {
    const d = getMumbaiLiveDate();
    return d.getHours() * 60 + d.getMinutes();
  }

  // ==========================================
  // 1.5. CROWDSOURCED LIVE TRACKING & SYNC ENGINE (PHASE 1 & PHASE 2 ARCHITECTURE)
  // ==========================================
  const CrowdLiveEngine = {
    channel: null,
    storageKey: 'ML_CROWD_LIVE_REPORTS_V1',
    reports: {},
    activeTrackingKey: null,
    gpsWatchId: null,

    init() {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          this.reports = JSON.parse(stored) || {};
        }
      } catch (e) {
        this.reports = {};
      }

      try {
        if (typeof BroadcastChannel !== 'undefined') {
          this.channel = new BroadcastChannel('mumbai_local_live_sync');
          this.channel.onmessage = (event) => {
            if (event.data && event.data.type === 'TRAIN_DELAY_SYNC') {
              this.reports = event.data.reports || {};
              if (typeof onCrowdReportsUpdated === 'function') {
                onCrowdReportsUpdated();
              }
            }
          };
        }
      } catch (e) {
        console.warn('BroadcastChannel sync init:', e);
      }

      this.fetchServerReports();
    },

    getTrainKey(trainItem) {
      if (!trainItem) return 'unknown';
      if (trainItem.train?.id) return String(trainItem.train.id);
      if (trainItem.train?.train_number) return `TN_${trainItem.train.train_number}`;
      const orig = (trainItem.originStation?.station_name || 'CCG').slice(0, 3).toUpperCase();
      const dest = (trainItem.destinationStation?.station_name || 'VR').slice(0, 3).toUpperCase();
      const dep = (trainItem.departureTime || trainItem.fromStop?.departure_time || '00:00').slice(0, 5);
      return `T_${orig}_${dest}_${dep}`;
    },

    getTrainDelay(trainItem) {
      if (!trainItem) return 0;
      if (typeof SmartDelayEngine !== 'undefined') {
        return SmartDelayEngine.getTrainDelay(trainItem);
      }
      const key = this.getTrainKey(trainItem);
      const rep = this.reports[key];
      if (rep && rep.isActive && rep.delayMinutes > 0) {
        return rep.delayMinutes;
      }
      return 0;
    },

    isUserInTrain(trainItem) {
      if (!trainItem) return false;
      const key = this.getTrainKey(trainItem);
      const rep = this.reports[key];
      return !!(rep && rep.isActive && rep.isUserInside);
    },

    async setTrainInReport(trainItem, isInside, delayMinutes = 15, stops = []) {
      if (!trainItem) return;
      const key = this.getTrainKey(trainItem);

      if (isInside) {
        this.reports[key] = {
          trainKey: key,
          trainId: trainItem.train?.id || null,
          trainNumber: trainItem.train?.train_number || '',
          isActive: true,
          isUserInside: true,
          delayMinutes: delayMinutes,
          updatedAt: Date.now()
        };
        this.activeTrackingKey = key;
        this.startPhase2GpsHook(trainItem, stops);
      } else {
        if (this.reports[key]) {
          this.reports[key].isActive = false;
          this.reports[key].isUserInside = false;
          this.reports[key].delayMinutes = 0;
        }
        if (this.activeTrackingKey === key) {
          this.stopPhase2GpsHook();
        }
      }

      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.reports));
      } catch (e) {}

      if (this.channel) {
        try {
          this.channel.postMessage({
            type: 'TRAIN_DELAY_SYNC',
            reports: this.reports,
            changedTrainKey: key
          });
        } catch (e) {}
      }

      this.sendServerReport(key, this.reports[key]);

      if (typeof onCrowdReportsUpdated === 'function') {
        onCrowdReportsUpdated();
      }
    },

    startPhase2GpsHook(trainItem, stops) {
      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        try {
          if (this.gpsWatchId) navigator.geolocation.clearWatch(this.gpsWatchId);
          this.gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
              const { latitude, longitude, speed } = pos.coords;
              this.handleLiveGpsTelemetry(trainItem, stops, latitude, longitude, speed);
            },
            (err) => {
              console.log('Phase 2 GPS Hook: waiting for mobile GPS signal/permission. Simulation active.', err.message);
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
          );
        } catch (e) {
          console.warn('Phase 2 GPS watch initialization:', e);
        }
      }
    },

    stopPhase2GpsHook() {
      if (this.gpsWatchId && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        try {
          navigator.geolocation.clearWatch(this.gpsWatchId);
        } catch (e) {}
        this.gpsWatchId = null;
      }
      this.activeTrackingKey = null;
    },

    handleLiveGpsTelemetry(trainItem, stops, lat, lng, speed) {
      const key = this.getTrainKey(trainItem);
      if (this.reports[key] && this.reports[key].isActive) {
        this.reports[key].latitude = lat;
        this.reports[key].longitude = lng;
        this.reports[key].speed = speed;
        this.reports[key].updatedAt = Date.now();
        this.sendServerReport(key, this.reports[key]);
      }
    },

    async fetchServerReports() {
      try {
        const res = await fetch('/api/trains/live-reports');
        if (res.ok) {
          const data = await res.json();
          if (data && data.reports) {
            this.reports = { ...this.reports, ...data.reports };
            if (typeof onCrowdReportsUpdated === 'function') {
              onCrowdReportsUpdated();
            }
          }
        }
      } catch (e) {}
    },

    async sendServerReport(key, reportData) {
      try {
        await fetch('/api/trains/live-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trainKey: key, report: reportData })
        });
      } catch (e) {}
    }
  };

  CrowdLiveEngine.init();

  // ==============================================================================
  // 1.5.5. 6-LAYER SMART TRAIN DELAY & ESTIMATED REACH TIME ENGINE
  // Layer 1: Timetable Base (Scheduled Timetable Baseline)
  // Layer 2: Diurnal Rush-Hour Congestion (Morning/Evening Organic Peak Dwell)
  // Layer 3: Official Incident & Snag Ingestion (Corridor signal & OHE alerts)
  // Layer 4: Corridor Rail ABS Queue Domino Ripple (3-minute headway propagation)
  // Layer 5: Passive Zero-Touch GPS Telemetry (28-115 km/h train rail matching)
  // Layer 6: Active Commuter Beacon Feedback (Direct toggle with trust priority)
  // ==============================================================================
  const SmartDelayEngine = {
    incidents: [],
    passiveTelemetryCache: new Map(), // trainKey -> { delayMinutes, timestamp }
    dominoDelaysCache: new Map(), // trainKey -> delayMinutes
    serverEstimatesCache: new Map(), // trainKey -> { result, timestamp }
    inFlightEstimates: new Set(),
    passiveGpsWatchId: null,
    lastPassivePingTime: 0,

    init() {
      this.fetchActiveIncidents();
      this.initPassiveZeroTouchGps();

      // Periodically refresh incident snags every 60 seconds
      setInterval(() => {
        this.fetchActiveIncidents();
      }, 60000);
    },

    // LAYER 2: Diurnal Rush-Hour Peak Dwell Delay Model
    calculateDiurnalDelay(departureTime, direction = 'DN', corridor = 'WR_SUBURBAN', lineType = 'SLOW') {
      const parts = (departureTime || '10:00:00').split(':');
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      const totalMinutes = hours * 60 + minutes;

      // Morning Peak (08:30 - 11:30): Southbound (UP) heavy crush
      const isMorningPeak = totalMinutes >= 510 && totalMinutes <= 690;
      // Evening Peak (17:30 - 21:00): Northbound (DN) heavy crush
      const isEveningPeak = totalMinutes >= 1050 && totalMinutes <= 1260;

      let delay = 0;
      if (isMorningPeak) {
        if (direction === 'UP') {
          delay = lineType === 'FAST' ? 3 : 4;
        } else {
          delay = 1;
        }
      } else if (isEveningPeak) {
        if (direction === 'DN') {
          delay = lineType === 'FAST' ? 4 : 5;
        } else {
          delay = 1;
        }
      }
      return delay;
    },

    // LAYER 3: Incident Snags Engine
    async fetchActiveIncidents() {
      try {
        const res = await fetch('/api/incidents');
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.incidents)) {
            this.incidents = data.incidents;
          }
        }
      } catch (e) {}
    },

    getIncidentDelayForTrain(trainItem) {
      if (!this.incidents || this.incidents.length === 0) return 0;
      const corridor = this.getCorridorKey(trainItem);
      const now = Date.now();

      for (const inc of this.incidents) {
        if (!inc.isActive) continue;
        if (inc.startTime && now < inc.startTime) continue;
        if (inc.endTime && now > inc.endTime) continue;
        if (inc.corridor && inc.corridor !== 'ALL' && inc.corridor !== corridor) continue;
        return inc.delayMinutes || 0;
      }
      return 0;
    },

    // LAYER 4: ABS Headway Domino Ripple Propagation across train sequence
    applyCorridorDomino(trains) {
      if (!trains || trains.length < 2) return;
      const queues = new Map();

      trains.forEach(t => {
        const corridor = this.getCorridorKey(t);
        const isFast = isTrainFast(t);
        const lineType = isFast ? 'FAST' : 'SLOW';
        const dir = t.route?.direction || 'DN';
        const qKey = `${corridor}_${lineType}_${dir}`;
        if (!queues.has(qKey)) queues.set(qKey, []);
        queues.get(qKey).push(t);
      });

      queues.forEach(q => {
        // Sort by suburban service day seconds
        q.sort((a, b) => {
          const sa = getServiceDaySeconds(a.departureTime || a.fromStop?.departure_time || '00:00:00');
          const sb = getServiceDaySeconds(b.departureTime || b.fromStop?.departure_time || '00:00:00');
          return sa - sb;
        });

        const H_MIN_SEC = 180; // 3.0 min ABS headway in seconds
        let prevActualDepSec = 0;

        for (let i = 0; i < q.length; i++) {
          const train = q[i];
          const trainKey = CrowdLiveEngine.getTrainKey(train);
          const schedSec = getServiceDaySeconds(train.departureTime || train.fromStop?.departure_time || '00:00:00');

          const activeDelay = CrowdLiveEngine.reports[trainKey]?.isActive ? (CrowdLiveEngine.reports[trainKey].delayMinutes || 0) : 0;
          const incDelay = this.getIncidentDelayForTrain(train);
          const passDelay = this.passiveTelemetryCache.get(trainKey)?.delayMinutes || 0;
          const diurnDelay = this.calculateDiurnalDelay(train.departureTime || train.fromStop?.departure_time);

          let initialDelay = Math.max(activeDelay, incDelay, passDelay, diurnDelay);
          let actualDepSec = schedSec + initialDelay * 60;

          if (i > 0) {
            const minAllowedDepSec = prevActualDepSec + H_MIN_SEC;
            if (actualDepSec < minAllowedDepSec) {
              const dominoDelayMin = Math.ceil((minAllowedDepSec - schedSec) / 60);
              if (dominoDelayMin > initialDelay) {
                this.dominoDelaysCache.set(trainKey, dominoDelayMin);
                actualDepSec = schedSec + dominoDelayMin * 60;
              }
            }
          }
          prevActualDepSec = actualDepSec;
        }
      });
    },

    // LAYER 5: Passive Zero-Touch GPS Telemetry
    initPassiveZeroTouchGps() {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
      try {
        this.passiveGpsWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            this.handlePassivePosition(pos);
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
        );
      } catch (e) {}
    },

    handlePassivePosition(pos) {
      if (!pos || !pos.coords) return;
      const { latitude, longitude, speed } = pos.coords;
      const now = Date.now();

      // Throttle pings to once every 15 seconds
      if (now - this.lastPassivePingTime < 15000) return;

      const speedKmh = (speed || 0) * 3.6;
      // Filter: speed >= 25 km/h and inside Mumbai suburban railway bounding box
      const isInMumbaiRail = latitude >= 18.89 && latitude <= 19.55 && longitude >= 72.75 && longitude <= 73.20;

      if (speedKmh >= 25 && isInMumbaiRail) {
        this.lastPassivePingTime = now;
        fetch('/api/telemetry/passive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude,
            longitude,
            speed: speedKmh,
            heading: pos.coords.heading || 0,
            timestamp: now,
            detectedTrainKey: CrowdLiveEngine.activeTrackingKey || 'PASSIVE_AUTO_CORRIDOR'
          })
        }).catch(() => {});
      }
    },

    getCorridorKey(trainItem) {
      const lineName = (trainItem?.line?.name || '').toLowerCase();
      const orig = (trainItem?.originStation?.station_name || '').toLowerCase();
      const dest = (trainItem?.destinationStation?.station_name || '').toLowerCase();

      if (lineName.includes('harbour') || orig.includes('panvel') || dest.includes('panvel')) {
        return 'CR_HARBOUR';
      }
      if (lineName.includes('central') || orig.includes('kalyan') || dest.includes('kalyan') || orig.includes('thane') || dest.includes('thane') || orig.includes('csmt') || dest.includes('csmt')) {
        return 'CR_MAIN';
      }
      return 'WR_SUBURBAN';
    },

    // 6-LAYER UNIFIED DELAY & ESTIMATED REACH TIME ARBITRATION
    getTrainDelayResult(trainItem) {
      if (!trainItem) {
        return {
          delayMinutes: 0,
          estimatedReachTime: '00:00:00',
          confidence: 'SCHEDULED_ONLY',
          primarySource: 'LAYER1_TIMETABLE',
          breakdown: { layer1Timetable: 0, layer2Diurnal: 0, layer3Incidents: 0, layer4Domino: 0, layer5PassiveTelemetry: 0, layer6ActiveCommuter: 0 }
        };
      }

      const key = CrowdLiveEngine.getTrainKey(trainItem);
      const depTime = trainItem.departureTime || trainItem.fromStop?.departure_time || '10:00:00';
      const isFast = isTrainFast(trainItem);
      const lineType = isFast ? 'FAST' : 'SLOW';
      const direction = trainItem.route?.direction || 'DN';
      const corridor = this.getCorridorKey(trainItem);

      // Layer 1: Timetable Base
      const l1Delay = 0;

      // Layer 2: Diurnal congestion
      const l2Delay = this.calculateDiurnalDelay(depTime, direction, corridor, lineType);

      // Layer 3: Incident snags
      const l3Delay = this.getIncidentDelayForTrain(trainItem);

      // Layer 4: Domino queue
      const l4Delay = this.dominoDelaysCache.get(key) || 0;

      // Layer 5: Passive telemetry
      const l5Delay = this.passiveTelemetryCache.get(key)?.delayMinutes || 0;

      // Layer 6: Active commuter feedback
      const activeRep = CrowdLiveEngine.reports[key];
      const l6Active = Boolean(activeRep && activeRep.isActive && activeRep.delayMinutes !== undefined);
      const l6Delay = l6Active ? activeRep.delayMinutes : 0;

      // Priority arbitration: Layer 6 > Layer 5 > Layer 4 > Layer 3 > Layer 2 > Layer 1
      let finalDelay = 0;
      let primarySource = 'LAYER1_TIMETABLE';
      let confidence = 'SCHEDULED_ONLY';

      if (l6Active) {
        finalDelay = l6Delay;
        primarySource = 'LAYER6_COMMUTER_BEACON';
        confidence = 'CONFIRMED_LIVE';
      } else if (l5Delay > 0) {
        finalDelay = l5Delay;
        primarySource = 'LAYER5_PASSIVE_GPS';
        confidence = 'HIGH';
      } else if (l4Delay > 0) {
        finalDelay = l4Delay;
        primarySource = 'LAYER4_DOMINO_QUEUE';
        confidence = 'MEDIUM';
      } else if (l3Delay > 0) {
        finalDelay = l3Delay;
        primarySource = 'LAYER3_OPERATIONAL_ALERT';
        confidence = 'MEDIUM';
      } else if (l2Delay > 0) {
        finalDelay = l2Delay;
        primarySource = 'LAYER2_DIURNAL_RUSH_HOUR';
        confidence = 'ESTIMATED_STATISTICAL';
      } else {
        finalDelay = 0;
        primarySource = 'LAYER1_TIMETABLE';
        confidence = 'SCHEDULED_ONLY';
      }

      // Calculate Estimated Reach Time (ETA = Scheduled Time + Delay)
      const depSec = parseTimeToSeconds(depTime);
      const etaSec = (depSec + finalDelay * 60) % 86400;
      const etaHh = Math.floor(etaSec / 3600);
      const etaMm = Math.floor((etaSec % 3600) / 60);
      const etaSs = etaSec % 60;
      const etaTimeStr = `${String(etaHh).padStart(2, '0')}:${String(etaMm).padStart(2, '0')}:${String(etaSs).padStart(2, '0')}`;

      // Asynchronous background server synchronization
      if (!this.serverEstimatesCache.has(key) && !this.inFlightEstimates.has(key)) {
        this.inFlightEstimates.add(key);
        fetch(`/api/delay/estimate?trainKey=${encodeURIComponent(key)}&departureTime=${encodeURIComponent(depTime)}&direction=${direction}&corridor=${corridor}&lineType=${lineType}&isAc=${isTrainAc(trainItem)}`)
          .then(res => res.json())
          .then(serverData => {
            if (serverData && serverData.finalDelayMinutes !== undefined) {
              this.serverEstimatesCache.set(key, { result: serverData, timestamp: Date.now() });
            }
          })
          .catch(() => {})
          .finally(() => {
            this.inFlightEstimates.delete(key);
          });
      }

      return {
        delayMinutes: finalDelay,
        estimatedReachTime: etaTimeStr,
        confidence,
        primarySource,
        breakdown: {
          layer1Timetable: l1Delay,
          layer2Diurnal: l2Delay,
          layer3Incidents: l3Delay,
          layer4Domino: l4Delay,
          layer5PassiveTelemetry: l5Delay,
          layer6ActiveCommuter: l6Delay
        }
      };
    },

    getTrainDelay(trainItem) {
      return this.getTrainDelayResult(trainItem).delayMinutes;
    }
  };

  SmartDelayEngine.init();

  // ==========================================
  // 1.6. DYNAMIC GPS-BASED TRAIN CROWD STRENGTH ENGINE
  // ==========================================
  const CrowdStrengthManager = {
    cache: new Map(), // trainKey -> { estimate, timestamp }
    inFlight: new Map(), // trainKey -> Promise
    expandedTileEl: null,
    autoCloseTimer: null,

    // Anonymous Pseudonymous Contributor ID (Privacy-first)
    getContributorId() {
      let id = localStorage.getItem('ML_CONTRIBUTOR_ID');
      if (!id) {
        id = 'contrib_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
        try { localStorage.setItem('ML_CONTRIBUTOR_ID', id); } catch (e) {}
      }
      return id;
    },

    // Format crowd display according to specification:
    // 0% -> 0%
    // < 100% -> rounded e.g. 05%, 25%, 50%, 75%
    // == 100% -> 100%
    // > 100% -> 100%+ (never numbers above 100%)
    // Bar width clamped 0..100% (never overflows)
    formatCrowdDisplay(rawScore) {
      const rounded = Math.round(rawScore);
      let displayPercentage = '0%';
      let visualPercentage = 0;
      let color = '#38bdf8'; // Blue (< 20%)

      if (rounded <= 0) {
        displayPercentage = '0%';
        visualPercentage = 0;
        color = '#38bdf8';
      } else if (rounded < 100) {
        displayPercentage = rounded < 10 ? `0${rounded}%` : `${rounded}%`;
        visualPercentage = rounded;
        if (rounded < 20) color = '#38bdf8'; // 05% Cyan/Blue
        else if (rounded < 50) color = '#22c55e'; // 25% Green
        else if (rounded < 75) color = '#f97316'; // 50% Amber/Orange
        else color = '#ea580c'; // 75% Red-Orange
      } else if (rounded === 100) {
        displayPercentage = '100%';
        visualPercentage = 100;
        color = '#dc2626'; // 100% Crimson Red
      } else {
        // Exceeds 100%
        displayPercentage = '100%+';
        visualPercentage = 100; // Never overflow container
        color = '#dc2626'; // Red glow
      }

      return { displayPercentage, visualPercentage, color };
    },

    // Deterministic diurnal rush-hour curve baseline (for instantaneous UI responsiveness)
    getDiurnalBaseline(depTime, direction = 'DN', isFast = false, isAc = false) {
      const parts = (depTime || '10:18:00').split(':');
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      const totalMinutes = hours * 60 + minutes;

      let score = 25;
      if (totalMinutes >= 60 && totalMinutes < 240) {
        score = 5; // 05%
      } else if (totalMinutes >= 240 && totalMinutes < 420) {
        score = 15;
      } else if (totalMinutes >= 480 && totalMinutes < 690) {
        // Morning Peak: Southbound/UP crush
        score = direction === 'UP' ? (96 + (isFast ? 18 : 6)) : 45;
      } else if (totalMinutes >= 690 && totalMinutes < 990) {
        score = 30 + (isFast ? 10 : 0);
      } else if (totalMinutes >= 1050 && totalMinutes < 1290) {
        // Evening Peak: Northbound/DN crush (100%+)
        score = direction === 'DN' ? (98 + (isFast ? 22 : 8)) : 52;
      } else {
        score = 25;
      }

      if (isAc) {
        score = Math.round(score * 0.7);
      }

      return score;
    },

    // Synchronous immediate calculation + async backend refresh
    getEstimate(trainItem, onServerUpdate) {
      if (!trainItem) {
        return { displayPercentage: '0%', visualPercentage: 0, color: '#38bdf8', rawScore: 0 };
      }

      const key = CrowdLiveEngine.getTrainKey(trainItem);
      const now = Date.now();
      const cached = this.cache.get(key);

      if (cached && (now - cached.timestamp < 30000)) {
        return cached.estimate;
      }

      const depTime = trainItem.departureTime || trainItem.fromStop?.departure_time || '10:18:00';
      const isFast = isTrainFast(trainItem);
      const isAc = isTrainAc(trainItem);
      const direction = trainItem.route?.direction || 'DN';

      const baseScore = this.getDiurnalBaseline(depTime, direction, isFast, isAc);
      const { displayPercentage, visualPercentage, color } = this.formatCrowdDisplay(baseScore);

      const localEstimate = {
        trainKey: key,
        rawScore: baseScore,
        displayPercentage,
        visualPercentage,
        color,
        state: 'AVAILABLE',
        contributorsCount: 0,
        confidence: 'LOW'
      };

      if (!cached) {
        this.cache.set(key, { estimate: localEstimate, timestamp: now });
      }

      // Asynchronous non-blocking background fetch
      if (!this.inFlight.has(key)) {
        const fetchPromise = fetch(`/api/crowd/estimate?trainKey=${encodeURIComponent(key)}&departureTime=${encodeURIComponent(depTime)}&isFast=${isFast}&isAc=${isAc}&direction=${direction}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.displayPercentage) {
              this.cache.set(key, { estimate: data, timestamp: Date.now() });
              if (typeof onServerUpdate === 'function') {
                onServerUpdate(data);
              }
            }
          })
          .catch(() => {})
          .finally(() => {
            this.inFlight.delete(key);
          });
        this.inFlight.set(key, fetchPromise);
      }

      return cached ? cached.estimate : localEstimate;
    },

    // Smoothly expand a tile with crowd data or "Not Schedulled - Currently Empty"
    expandTile(tileEl, trainItem) {
      if (!tileEl) return;

      // Close previously expanded tile smoothly
      if (this.expandedTileEl && this.expandedTileEl !== tileEl) {
        this.collapseTile(this.expandedTileEl);
      }

      this.expandedTileEl = tileEl;
      tileEl.classList.remove('is-holding');
      tileEl.classList.add('crowd-expanded');

      // Haptic feedback
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([40, 30, 40]); } catch (e) {}
      }

      const opStatus = typeof getTrainOperationalStatus === 'function'
        ? getTrainOperationalStatus(trainItem)
        : { isOperational: true, displayText: '' };

      const crowdRow = tileEl.querySelector('.tile-crowd-row');
      const emptyRow = tileEl.querySelector('.tile-crowd-empty-row');

      if (!opStatus.isOperational) {
        // Train is NOT running and NOT set for departure:
        // Hide crowd bar, show "Not Schedulled - Currently Empty"
        if (crowdRow) crowdRow.style.display = 'none';
        if (emptyRow) {
          emptyRow.style.display = 'flex';
          const badgeEl = emptyRow.querySelector('.tile-crowd-empty-badge');
          if (badgeEl) {
            badgeEl.innerHTML = `<span class="tile-crowd-empty-dot"></span>Not Schedulled - Currently Empty`;
          }
        }
      } else {
        // Train IS currently running or set for departure:
        if (emptyRow) emptyRow.style.display = 'none';
        if (crowdRow) crowdRow.style.display = 'flex';

        // Animate progress bar fill smoothly
        const fillEl = tileEl.querySelector('.tile-crowd-fill');

        // Get or refresh estimate
        const est = this.getEstimate(trainItem, (serverEst) => {
          if (tileEl.classList.contains('crowd-expanded')) {
            this.applyEstimateToTile(tileEl, serverEst);
          }
        });

        this.applyEstimateToTile(tileEl, est);

        // Trigger width animation on next animation frame
        if (fillEl) {
          fillEl.style.width = '0%';
          requestAnimationFrame(() => {
            setTimeout(() => {
              fillEl.style.width = `${est.visualPercentage}%`;
            }, 40);
          });
        }
      }

      // Automatically close in 5 seconds
      if (this.autoCloseTimer) {
        clearTimeout(this.autoCloseTimer);
      }
      this.autoCloseTimer = setTimeout(() => {
        this.collapseTile(tileEl);
      }, 5000);
    },

    collapseTile(tileEl) {
      if (!tileEl) return;
      tileEl.classList.remove('crowd-expanded');
      tileEl.classList.remove('is-holding');
      if (this.expandedTileEl === tileEl) {
        this.expandedTileEl = null;
      }
      if (this.autoCloseTimer) {
        clearTimeout(this.autoCloseTimer);
        this.autoCloseTimer = null;
      }
      // Wait for drawer collapse CSS animation to complete before resetting fill width
      setTimeout(() => {
        if (!tileEl.classList.contains('crowd-expanded')) {
          const fillEl = tileEl.querySelector('.tile-crowd-fill');
          if (fillEl) fillEl.style.width = '0%';
        }
      }, 500);
    },

    applyEstimateToTile(tileEl, est) {
      if (!tileEl || !est) return;
      const fillEl = tileEl.querySelector('.tile-crowd-fill');
      const valEl = tileEl.querySelector('.tile-crowd-pct');
      const lblEl = tileEl.querySelector('.tile-crowd-label');

      if (valEl) {
        valEl.textContent = est.displayPercentage;
        valEl.style.color = est.color;
      }
      if (lblEl) {
        lblEl.style.color = est.color;
      }
      if (fillEl) {
        fillEl.setAttribute('data-target-pct', est.visualPercentage);
        fillEl.style.backgroundColor = est.color;
        fillEl.style.width = `${est.visualPercentage}%`;
        if (est.visualPercentage >= 100) {
          fillEl.classList.add('fill-extreme');
          fillEl.style.boxShadow = `0 0 8px ${est.color}CC`;
        } else {
          fillEl.classList.remove('fill-extreme');
          fillEl.style.boxShadow = `0 0 5px ${est.color}88`;
        }
      }
    }
  };


  const MOON_ICON_SVG = `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
  const SUN_ICON_SVG = `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;

  function updateThemeUI() {
    try {
      const isNight = currentTheme === 'theme-night';
      const headerIcon = document.getElementById('themeHeaderIcon');
      const quickIcon = document.getElementById('themeQuickIcon');
      const quickText = document.getElementById('themeQuickText');
      const drawerIcon = document.getElementById('drawerThemeIcon');
      const drawerText = document.getElementById('drawerThemeText');

      // User Specification: Show Sun icon in Dark mode and Moon icon in White mode
      if (headerIcon) headerIcon.innerHTML = isNight ? SUN_ICON_SVG : MOON_ICON_SVG;
      if (quickIcon) quickIcon.innerHTML = isNight ? SUN_ICON_SVG : MOON_ICON_SVG;
      if (quickText) quickText.textContent = isNight ? 'Switch to Day Theme' : 'Switch to Night Theme';
      if (drawerIcon) drawerIcon.innerHTML = isNight ? SUN_ICON_SVG : MOON_ICON_SVG;
      if (drawerText) drawerText.textContent = isNight ? 'Switch to Day Theme' : 'Switch to Night Theme';
    } catch (err) {
      console.warn('Error updating theme UI:', err);
    }
  }

  // Apply initial theme
  document.body.className = currentTheme;
  updateThemeUI();

  // Update Status Bar Clock (12-Hour Format: e.g. 5:51)
  function updateClock() {
    try {
      const now = (typeof getMumbaiLiveDate === 'function') ? getMumbaiLiveDate() : new Date();
      let h = now.getHours() % 12;
      if (h === 0) h = 12;
      const hh = String(h);
      const mm = String(now.getMinutes()).padStart(2, '0');
      const el = document.getElementById('statusTime');
      if (el) el.textContent = `${hh}:${mm}`;
    } catch (e) {
      const fallback = new Date();
      let h = fallback.getHours() % 12 || 12;
      const el = document.getElementById('statusTime');
      if (el) el.textContent = `${h}:${String(fallback.getMinutes()).padStart(2, '0')}`;
    }
  }
  updateClock();
  setInterval(updateClock, 1000);

  // Toast Helper
  function showToast(message, duration = 3000) {
    const toast = document.getElementById('toastNotice');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // Screen Switcher Helper with smooth transition
  function showScreen(screenId) {
    const screens = document.querySelectorAll('.app-screen');
    screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
    }
  }

  // ==========================================
  // 2. THEME SWITCHING (NIGHT: Black & Purple | DAY: White & Purple)
  // ==========================================
  function toggleTheme() {
    if (currentTheme === 'theme-night') {
      currentTheme = 'theme-day';
    } else {
      currentTheme = 'theme-night';
    }
    document.body.className = currentTheme;
    localStorage.setItem('ml_theme', currentTheme);
    updateThemeUI();
  }

  document.getElementById('btnToggleTheme')?.addEventListener('click', toggleTheme);
  document.getElementById('themeToggleQuick')?.addEventListener('click', toggleTheme);
  document.getElementById('drawerThemeSwitch')?.addEventListener('click', () => {
    toggleTheme();
    closeDrawer();
  });

  // ==========================================
  // 3. AUTHENTICATION FLOW (Screens 1, 2, 3)
  // ==========================================
  
  // App Entry / Boot Lifecycle
  function bootApp(forceSplash = false) {
    if (isAuthenticated && !forceSplash) {
      showScreen('screen-home');
      return;
    }
    showScreen('screen-splash');
    // Splash screen runs for a snappy 600ms
    setTimeout(() => {
      if (isAuthenticated) {
        showScreen('screen-home');
      } else {
        showScreen('screen-mobile-login');
      }
    }, 600);
  }

  bootApp();

  // Allow clicking anywhere on splash screen to advance immediately
  document.getElementById('screen-splash')?.addEventListener('click', () => {
    isAuthenticated = localStorage.getItem('ml_authenticated') !== 'false';
    if (isAuthenticated) {
      showScreen('screen-home');
    } else {
      showScreen('screen-mobile-login');
    }
  });

  // Mobile Input Formatting (e.g. 98765 43210)
  const phoneInput = document.getElementById('phoneInput');
  phoneInput?.addEventListener('input', (e) => {
    let digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    if (digits.length > 5) {
      e.target.value = digits.slice(0, 5) + ' ' + digits.slice(5);
    } else {
      e.target.value = digits;
    }
  });

  // Screen 2: Login -> Send OTP
  const btnLoginSendOtp = document.getElementById('btnLoginSendOtp');
  btnLoginSendOtp?.addEventListener('click', () => {
    const rawVal = phoneInput?.value.replace(/\D/g, '') || '';
    if (rawVal.length !== 10) {
      showToast('⚠️ Please enter a valid 10-digit mobile number');
      phoneInput?.focus();
      return;
    }

    // Generate random 4-digit code
    generatedOtp = String(Math.floor(1000 + Math.random() * 9000));
    showToast(`🔑 Your verification OTP is: ${generatedOtp}`, 5000);

    // Transition to Screen 3
    showScreen('screen-otp');
    startOtpCountdown();

    // Auto-focus first box
    setTimeout(() => {
      document.getElementById('otp-1')?.focus();
    }, 300);
  });

  // Screen 3: OTP Input Box Handling
  const otpBoxes = [
    document.getElementById('otp-1'),
    document.getElementById('otp-2'),
    document.getElementById('otp-3'),
    document.getElementById('otp-4')
  ];

  otpBoxes.forEach((box, idx) => {
    box?.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[val.length - 1] : '';
      if (val && idx < 3) {
        otpBoxes[idx + 1]?.focus();
      }
      // Check if all filled
      checkAutoSubmitOtp();
    });

    box?.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        otpBoxes[idx - 1]?.focus();
      }
    });
  });

  function checkAutoSubmitOtp() {
    const entered = otpBoxes.map(b => b?.value || '').join('');
    if (entered.length === 4) {
      verifyAndLogin(entered);
    }
  }

  // Screen 3: Verify Button
  document.getElementById('btnVerifyOtp')?.addEventListener('click', () => {
    const entered = otpBoxes.map(b => b?.value || '').join('');
    if (entered.length < 4) {
      showToast('⚠️ Please enter all 4 digits');
      return;
    }
    verifyAndLogin(entered);
  });

  function verifyAndLogin(enteredCode) {
    // Accept generated OTP or standard 4821 / 1234 demo code
    if (enteredCode === generatedOtp || enteredCode === '4821' || enteredCode === '1234') {
      isAuthenticated = true;
      localStorage.setItem('ml_authenticated', 'true');
      const enteredPhone = phoneInput?.value || '00000 00000';
      localStorage.setItem('ml_user_phone', enteredPhone);
      updateDrawerUserInfo();
      showToast('✅ Verified successfully! Welcome to MumbaiLocal');
      setTimeout(() => {
        showScreen('screen-home');
      }, 500);
    } else {
      showToast(`❌ Incorrect OTP. (Use ${generatedOtp})`);
      otpBoxes.forEach(b => { if (b) b.value = ''; });
      otpBoxes[0]?.focus();
    }
  }

  // Resend OTP Countdown
  let resendTimer = null;
  function startOtpCountdown() {
    let timeLeft = 30;
    const countdownEl = document.getElementById('otpCountdown');
    const resendBtn = document.getElementById('btnResendOtp');
    if (resendBtn) resendBtn.disabled = true;

    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      timeLeft--;
      if (countdownEl) countdownEl.textContent = `Resend OTP in ${timeLeft}s`;
      if (timeLeft <= 0) {
        clearInterval(resendTimer);
        if (countdownEl) countdownEl.textContent = 'Did not receive code?';
        if (resendBtn) resendBtn.disabled = false;
      }
    }, 1000);
  }

  document.getElementById('btnResendOtp')?.addEventListener('click', () => {
    generatedOtp = String(Math.floor(1000 + Math.random() * 9000));
    showToast(`🔑 New OTP sent: ${generatedOtp}`, 5000);
    startOtpCountdown();
  });

  // Reset / Logout Helper (For re-testing auth flow)
  function resetAuth() {
    localStorage.setItem('ml_authenticated', 'false');
    isAuthenticated = false;
    showToast('🔄 Login status reset. Restarting authentication flow...');
    setTimeout(() => {
      bootApp(true);
    }, 400);
  }
  document.getElementById('authResetQuick')?.addEventListener('click', resetAuth);
  document.getElementById('drawerTestAuth')?.addEventListener('click', () => {
    closeDrawer();
    resetAuth();
  });

  // Supporting Tool: Refresh Page (preserves active login and refreshes directly)
  document.getElementById('btnRefreshPageQuick')?.addEventListener('click', () => {
    localStorage.setItem('ml_authenticated', 'true');
    isAuthenticated = true;
    showToast('🔄 Refreshing current page...');
    setTimeout(() => {
      window.location.reload();
    }, 200);
  });

  // ==========================================
  // 4. SIDE DRAWER MENU (70% Minimalist User Design)
  // ==========================================
  const overlay = document.getElementById('sideDrawerOverlay');

  function updateDrawerUserInfo() {
    const userPhoneEl = document.getElementById('drawerUserPhone');
    if (userPhoneEl) {
      const savedPhone = localStorage.getItem('ml_user_phone') || '00000 00000';
      userPhoneEl.textContent = savedPhone;
    }
    // Notification state is restored by restoreNotifUI() after the engine is set up
  }

  function openDrawer() {
    updateDrawerUserInfo();
    overlay?.classList.add('open');
  }

  function closeDrawer() {
    overlay?.classList.remove('open');
  }

  document.getElementById('btnOpenMenu')?.addEventListener('click', openDrawer);

  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeDrawer();
  });

  // Logout Button in Drawer
  document.getElementById('btnDrawerLogout')?.addEventListener('click', () => {
    closeDrawer();
    resetAuth();
    showToast('🚪 Logged out successfully');
  });

  // ==========================================
  // STOPS NOTIFICATION ENGINE
  // ==========================================

  const NOTIF_PREFS_KEY = 'ml_notif_prefs';

  function getNotifPrefs() {
    try {
      return JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || '{}');
    } catch { return {}; }
  }

  function saveNotifPrefs(prefs) {
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
  }

  // -- DOM refs --
  const toggleNotif           = document.getElementById('toggleStopsNotification');
  const menuItemStopsNotif    = document.getElementById('menuItemStopsNotification');
  const accordion             = document.getElementById('notifAccordion');
  const chkShutter            = document.getElementById('chkNotifShutter');
  const chkHeader             = document.getElementById('chkNotifHeader');
  const chkVibrate            = document.getElementById('chkNotifVibrate');
  const chkAllowAll           = document.getElementById('chkNotifAllowAll');
  const shutterCard           = document.getElementById('shutterNotifCard');
  const headerPill            = document.getElementById('headerNotifPill');
  const headerPillText        = document.getElementById('headerNotifText');
  const btnShutterClose       = document.getElementById('btnShutterNotifClose');
  const shutterPrev           = document.getElementById('shutterStnPrev');
  const shutterCurr           = document.getElementById('shutterStnCurrent');
  const shutterNext           = document.getElementById('shutterStnNext');
  const shutterArrivedBadge   = document.getElementById('shutterArrivedBadge');
  const shutterEtaBadge       = document.getElementById('shutterEtaBadge');
  const androidShutterShade   = document.getElementById('androidShutterShade');
  const shadeBackdrop         = document.getElementById('androidShadeBackdrop');
  const shadePullHandle       = document.getElementById('shadePullHandle');
  const phoneStatusBar        = document.getElementById('phoneStatusBar');
  const shadeMlCardHost       = document.getElementById('shadeMlCardHost');

  // -- Read saved state and restore UI --
  function restoreNotifUI() {
    const prefs = getNotifPrefs();
    // Default accordion to CLOSED (simple accordion, not always open)
    if (accordion) accordion.classList.remove('open');
    const wrapper = document.getElementById('stopsNotifWrapper');
    if (wrapper) wrapper.classList.remove('open');
    if (menuItemStopsNotif) menuItemStopsNotif.setAttribute('aria-expanded', 'false');

    if (chkShutter)  chkShutter.checked  = Boolean(prefs.shutter);
    if (chkHeader)   chkHeader.checked   = Boolean(prefs.header);
    if (chkVibrate)  chkVibrate.checked  = Boolean(prefs.vibrate);
    if (chkAllowAll) chkAllowAll.checked = Boolean(prefs.allowAll || (prefs.shutter && prefs.header && prefs.vibrate));
  }

  // Toggle accordion open/close on header click (without toggle switch)
  function toggleStopsAccordion(forceState) {
    if (!accordion) return;
    const wrapper = document.getElementById('stopsNotifWrapper');
    const willOpen = typeof forceState === 'boolean'
      ? forceState
      : !accordion.classList.contains('open');

    accordion.classList.toggle('open', willOpen);
    wrapper?.classList.toggle('open', willOpen);
    menuItemStopsNotif?.setAttribute('aria-expanded', String(willOpen));
  }

  menuItemStopsNotif?.addEventListener('click', (e) => {
    // If click was on a checkbox or inside the open accordion, do not toggle header
    if (e.target.closest('.notif-accordion')) return;
    toggleStopsAccordion();
  });

  // Smoothly close accordion after a selection (smooth transition)
  let closeAccordionTimer = null;
  function scheduleSmoothAccordionClose() {
    if (closeAccordionTimer) clearTimeout(closeAccordionTimer);
    closeAccordionTimer = setTimeout(() => {
      toggleStopsAccordion(false);
    }, 420);
  }

  // ========================================================
  // Accordion 4 Options Logic:
  // Multi-select enabled: NO radio button logic!
  // User can check Shutter, Header, Vibrate, or any combination.
  // ========================================================

  function updateNotifEngineState() {
    const prefs = getNotifPrefs();
    const hasAny = Boolean(prefs.shutter || prefs.header || prefs.vibrate);
    prefs.enabled = hasAny;

    // Auto-update Allow All checkmark if all 3 are checked
    if (prefs.shutter && prefs.header && prefs.vibrate) {
      prefs.allowAll = true;
      if (chkAllowAll) chkAllowAll.checked = true;
    } else {
      prefs.allowAll = false;
      if (chkAllowAll) chkAllowAll.checked = false;
    }

    saveNotifPrefs(prefs);

    if (hasAny) {
      notifEngine.startActiveTracking();
    } else {
      notifEngine.stopAll();
      hideShutterCard();
      hideHeaderPill();
    }

    // Smoothly close the accordion after selection
    scheduleSmoothAccordionClose();
  }

  // 1. Show Only in Shutter (Check Box - Multi-select, NO radio logic)
  chkShutter?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const prefs = getNotifPrefs();
    prefs.shutter = isChecked;
    saveNotifPrefs(prefs);

    if (!isChecked) hideShutterCard();
    showToast(isChecked ? '📱 Shutter Notification Enabled' : '📱 Shutter Notification Disabled');
    updateNotifEngineState();
  });

  // 2. Show only in header (Check Box - Multi-select, NO radio logic)
  chkHeader?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const prefs = getNotifPrefs();
    prefs.header = isChecked;
    saveNotifPrefs(prefs);

    if (!isChecked) hideHeaderPill();
    showToast(isChecked ? '📌 Header Bar Notification Enabled' : '📌 Header Bar Notification Disabled');
    updateNotifEngineState();
  });

  // 3. Vibrat before 1 mnts (Check Box)
  chkVibrate?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const prefs = getNotifPrefs();
    prefs.vibrate = isChecked;
    saveNotifPrefs(prefs);

    if (isChecked && navigator.vibrate) navigator.vibrate([80, 40, 80]);
    showToast(isChecked ? '📳 Vibrate Before 1 Minute Enabled' : '📳 Vibration Notification Disabled');
    updateNotifEngineState();
  });

  // 4. Allow All (Check Box - sets all or unsets all)
  chkAllowAll?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const prefs = getNotifPrefs();

    prefs.allowAll = isChecked;
    prefs.shutter  = isChecked;
    prefs.header   = isChecked;
    prefs.vibrate  = isChecked;
    prefs.enabled  = isChecked;

    if (chkShutter)  chkShutter.checked  = isChecked;
    if (chkHeader)   chkHeader.checked   = isChecked;
    if (chkVibrate)  chkVibrate.checked  = isChecked;

    saveNotifPrefs(prefs);

    if (isChecked) {
      showToast('✨ All Notifications Enabled (Shutter + Header + Vibration)');
      notifEngine.startActiveTracking();
    } else {
      notifEngine.stopAll();
      hideShutterCard();
      hideHeaderPill();
      showToast('🔕 All Notification options cleared');
    }
    scheduleSmoothAccordionClose();
  });

  // -- Full Android Shutter Pull-down Shade handling --
  function openAndroidShade() {
    if (!androidShutterShade) return;
    androidShutterShade.classList.add('shade-open');
    androidShutterShade.setAttribute('aria-hidden', 'false');
  }

  function closeAndroidShade() {
    if (!androidShutterShade) return;
    androidShutterShade.classList.remove('shade-open');
    androidShutterShade.setAttribute('aria-hidden', 'true');
  }

  function toggleAndroidShade() {
    if (!androidShutterShade) return;
    if (androidShutterShade.classList.contains('shade-open')) {
      closeAndroidShade();
    } else {
      openAndroidShade();
    }
  }

  // -- Real Android Shutter Gesture Controller --
  // Drag down from top status bar / notch to open; drag up from bottom handle to close
  function initAndroidShutterGestures() {
    if (!androidShutterShade || !phoneStatusBar) return;

    const panel = document.getElementById('androidShadePanel');
    const handle = document.getElementById('shadePullHandle');
    if (!panel) return;

    let isDragging = false;
    let startY = 0;
    let currentY = 0;
    let panelHeight = 520;
    let dragMode = null; // 'open' or 'close'

    function getPanelHeight() {
      return panel.getBoundingClientRect().height || 520;
    }

    // 1. Drag Down to Open
    function onTopPointerDown(e) {
      if (androidShutterShade.classList.contains('shade-open')) return;
      isDragging = true;
      dragMode = 'open';
      startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      currentY = startY;
      panelHeight = getPanelHeight();

      androidShutterShade.classList.add('shade-dragging', 'shade-open');
      panel.style.transform = `translateY(${-panelHeight}px)`;
      if (shadeBackdrop) shadeBackdrop.style.opacity = '0';

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    }

    // 2. Drag Up to Close
    function onBottomPointerDown(e) {
      if (!androidShutterShade.classList.contains('shade-open')) return;
      isDragging = true;
      dragMode = 'close';
      startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      currentY = startY;
      panelHeight = getPanelHeight();

      androidShutterShade.classList.add('shade-dragging');

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      currentY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      const deltaY = currentY - startY;

      if (dragMode === 'open') {
        const pullDistance = Math.max(0, deltaY);
        const transY = Math.min(0, -panelHeight + pullDistance);
        panel.style.transform = `translateY(${transY}px)`;
        const progress = Math.min(1, pullDistance / (panelHeight * 0.75));
        if (shadeBackdrop) shadeBackdrop.style.opacity = String(progress);
      } else if (dragMode === 'close') {
        const pullDistance = Math.min(0, deltaY);
        const transY = Math.max(-panelHeight, pullDistance);
        panel.style.transform = `translateY(${transY}px)`;
        const progress = Math.max(0, 1 - (Math.abs(pullDistance) / (panelHeight * 0.65)));
        if (shadeBackdrop) shadeBackdrop.style.opacity = String(progress);
      }
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      androidShutterShade.classList.remove('shade-dragging');
      panel.style.transform = '';
      if (shadeBackdrop) shadeBackdrop.style.opacity = '';

      const deltaY = currentY - startY;

      if (dragMode === 'open') {
        if (deltaY > panelHeight * 0.2 || deltaY > 55) {
          openAndroidShade();
        } else {
          closeAndroidShade();
        }
      } else if (dragMode === 'close') {
        if (deltaY < -panelHeight * 0.16 || deltaY < -45) {
          closeAndroidShade();
        } else {
          openAndroidShade();
        }
      }
      dragMode = null;
    }

    phoneStatusBar.addEventListener('pointerdown', onTopPointerDown);
    const notch = document.querySelector('.phone-notch');
    if (notch) notch.addEventListener('pointerdown', onTopPointerDown);

    if (handle) handle.addEventListener('pointerdown', onBottomPointerDown);

    phoneStatusBar.addEventListener('click', (e) => {
      if (Math.abs(currentY - startY) < 8) toggleAndroidShade();
    });
    if (shadeBackdrop) {
      shadeBackdrop.addEventListener('click', closeAndroidShade);
    }
    if (handle) {
      handle.addEventListener('click', (e) => {
        if (Math.abs(currentY - startY) < 8) closeAndroidShade();
      });
    }
  }

  // -- Shutter card controls --
  function showShutterCard() {
    if (!shutterCard) return;
    shutterCard.classList.remove('shutter-notif-hidden');
    shutterCard.classList.add('shutter-notif-visible');
  }

  function hideShutterCard() {
    if (!shutterCard) return;
    shutterCard.classList.remove('shutter-notif-visible');
    shutterCard.classList.add('shutter-notif-hidden');
  }

  function updateShutterCard({ prev = 'Prabhadevi', curr = 'Dadar', next = 'Matunga Rd.', state = 'arrived', eta = 'in 2.5 min' }) {
    if (!shutterCard) return;
    if (shutterPrev) shutterPrev.textContent = prev;
    if (shutterCurr) shutterCurr.textContent = curr;
    if (shutterNext) shutterNext.textContent = next;
    if (shutterArrivedBadge) shutterArrivedBadge.textContent = 'Arrived ' + curr;
    if (shutterEtaBadge) shutterEtaBadge.textContent = eta;

    shutterCard.classList.remove('state-arrived', 'state-inbetween');
    if (state === 'arrived') {
      shutterCard.classList.add('state-arrived');
    } else {
      shutterCard.classList.add('state-inbetween');
    }

    showShutterCard();
  }

  // -- Header pill controls --
  function showHeaderPill(text, type = 'arrived') {
    if (!headerPill || !headerPillText) return;
    headerPillText.textContent = text;
    headerPill.classList.remove(
      'header-notif-hidden', 'header-notif-visible',
      'header-notif-arrived', 'header-notif-upcoming'
    );
    void headerPill.offsetWidth; // force reflow
    headerPill.classList.add('header-notif-visible');
    headerPill.classList.add(type === 'arrived' ? 'header-notif-arrived' : 'header-notif-upcoming');
  }

  function hideHeaderPill() {
    if (!headerPill) return;
    headerPill.classList.remove('header-notif-visible');
    headerPill.classList.add('header-notif-hidden');
  }

  // -- Close button on shutter card --
  if (btnShutterClose) {
    btnShutterClose.addEventListener('click', (e) => {
      e.stopPropagation();
      hideShutterCard();
    });
  }

  // ========================================================
  // STOPS NOTIFICATION ENGINE
  // Dynamic Width Header Pill + Android Shutter Card
  // 18s duration on Arrival, 20s interval for Upcoming
  // Automatic 3-minute check and progress without asking
  // ========================================================
  const notifEngine = {
    _shutterTimer: null,
    _headerTimer: null,
    _upcomingInterval: null,
    _check3MinInterval: null,
    _activeTrackingIndex: 1,
    _trackingStops: ['Prabhadevi', 'Dadar', 'Matunga Rd.', 'Mahim', 'Bandra', 'Khar Road', 'Santacruz', 'Vile Parle', 'Andheri'],

    // Called when a journey stop is reached (Arrival state: Phone 1 & Phone 3)
    // "Arrived: Notification Will show like this on any screen till 18 sec. (Dynamic Width according to name)"
    onArrived(stationName = 'Dadar', prevStation = 'Prabhadevi', nextStation = 'Matunga Rd.') {
      const prefs = getNotifPrefs();
      if (!prefs.enabled) return;

      const showS = prefs.shutter !== false;
      const showH = prefs.header !== false;

      // 1. Shutter Notification Card (Phone 1 Mockup)
      if (showS) {
        updateShutterCard({
          prev: prevStation,
          curr: stationName,
          next: nextStation,
          state: 'arrived'
        });
      }

      // 2. Header Bar Pill (Phone 3 Mockup: green pill, dynamic width, stays till 18 sec!)
      if (showH) {
        showHeaderPill(stationName, 'arrived');
        clearTimeout(this._headerTimer);
        this._headerTimer = setTimeout(() => hideHeaderPill(), 18000);
      }

      // 3. Vibration if enabled
      if (prefs.vibrate && navigator.vibrate) {
        navigator.vibrate([150, 70, 150]);
      }
    },

    // Called when train is in-between stops (In between state: Phone 2 & Phone 4)
    // "Next Upcoming Stop : Notification Will show like this on any screen (After Every 20 sec.) (Dynamic Width according to name)"
    onInBetween(prevStation = 'Prabhadevi', currStation = 'Dadar', nextStation = 'Matunga Rd.', etaStr = 'in 2.5 min') {
      const prefs = getNotifPrefs();
      if (!prefs.enabled) return;

      const showS = prefs.shutter !== false;
      const showH = prefs.header !== false;

      // 1. Shutter Notification Card (Phone 2 Mockup: glowing orange progress line + in 2.5 min)
      if (showS) {
        updateShutterCard({
          prev: prevStation,
          curr: currStation,
          next: nextStation,
          state: 'inbetween',
          eta: etaStr
        });
      }

      // 2. Header Bar Pill (Phone 4 Mockup: orange pill "Next Matunga Rd.", dynamic width!)
      if (showH) {
        showHeaderPill('Next ' + nextStation, 'upcoming');
        clearTimeout(this._headerTimer);
        // Pill shows for 7 seconds during each 20-second cycle
        this._headerTimer = setTimeout(() => hideHeaderPill(), 7000);
      }
    },

    // Start recurring 20-second timer for in-between upcoming stops
    startUpcomingCycle(prevStation = 'Prabhadevi', currStation = 'Dadar', nextStation = 'Matunga Rd.') {
      clearInterval(this._upcomingInterval);
      this.onInBetween(prevStation, currStation, nextStation, 'in 2.5 min');
      // Fires after every 20 seconds!
      this._upcomingInterval = setInterval(() => {
        const prefs = getNotifPrefs();
        if (!prefs.enabled) {
          clearInterval(this._upcomingInterval);
          return;
        }
        this.onInBetween(prevStation, currStation, nextStation, 'in 2.5 min');
      }, 20000);
    },

    // Automatic Live Tracking: runs automatically every 3 mins without asking
    startActiveTracking() {
      this.stopAll();

      // Automatically enable train tracking without asking user on "You are currently in this train ?"
      isUserInThisTrain = true;
      const subbarToggle = document.getElementById('toggleInThisTrain');
      if (subbarToggle) subbarToggle.checked = true;

      // Use active journey stations if available, else mockup corridor
      if (Array.isArray(currentJourneyStops) && currentJourneyStops.length >= 3) {
        this._trackingStops = currentJourneyStops.map(s => s.station_name || s.name || 'Station');
      } else {
        this._trackingStops = ['Prabhadevi', 'Dadar', 'Matunga Rd.', 'Mahim', 'Bandra', 'Khar Road', 'Santacruz', 'Vile Parle', 'Andheri'];
      }

      this._activeTrackingIndex = 1; // Dadar
      this._runCurrentStopCycle();

      // Recurring 3-minute check interval (180,000 ms)
      this._check3MinInterval = setInterval(() => {
        const prefs = getNotifPrefs();
        if (!prefs.enabled) {
          this.stopAll();
          return;
        }
        this._activeTrackingIndex = (this._activeTrackingIndex + 1) % (this._trackingStops.length - 1);
        if (this._activeTrackingIndex === 0) this._activeTrackingIndex = 1;
        this._runCurrentStopCycle();
      }, 180000); // 3 minutes
    },

    _runCurrentStopCycle() {
      const idx = this._activeTrackingIndex;
      const prev = this._trackingStops[Math.max(0, idx - 1)];
      const curr = this._trackingStops[idx];
      const next = this._trackingStops[Math.min(this._trackingStops.length - 1, idx + 1)];

      // 1. Arrived state for 18 seconds (Phone 1 & Phone 3)
      this.onArrived(curr, prev, next);

      // 2. After 18 seconds, transition to in-between towards next stop (Phone 2 & Phone 4)
      clearTimeout(this._shutterTimer);
      this._shutterTimer = setTimeout(() => {
        const prefs = getNotifPrefs();
        if (!prefs.enabled) return;
        this.startUpcomingCycle(prev, curr, next);
      }, 18000);
    },

    stopAll() {
      clearTimeout(this._shutterTimer);
      clearTimeout(this._headerTimer);
      clearInterval(this._upcomingInterval);
      clearInterval(this._check3MinInterval);
      hideShutterCard();
      hideHeaderPill();
      closeAndroidShade();
    }
  };

  // Expose engine to window for global access
  window.stopsNotifEngine = notifEngine;

  // Initialize real Android shutter dragging gestures
  initAndroidShutterGestures();

  // Restore prefs on load and start tracking if active
  restoreNotifUI();
  if (getNotifPrefs().enabled) {
    notifEngine.startActiveTracking();
  }

  // Preview Test Buttons in Stops Notification Accordion
  document.getElementById('btnPreviewArrived')?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifEngine.stopAll();
    notifEngine.onArrived('Dadar', 'Prabhadevi', 'Matunga Rd.');
    showToast('🟢 Arrived At: Dadar (18s green pill in status bar)');
  });

  document.getElementById('btnPreviewInbetween')?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifEngine.stopAll();
    notifEngine.startUpcomingCycle('Prabhadevi', 'Dadar', 'Matunga Rd.');
    showToast('🟠 In between: Next Matunga Rd. (Every 20s orange pill)');
  });

  // ==========================================
  // Menu Items (simplicity placeholders)
  // ==========================================
  document.getElementById('menuItemAlerts')?.addEventListener('click', () => {
    showToast('🔔 Alerts');
  });

  document.getElementById('menuItemCommunity')?.addEventListener('click', () => {
    showToast('👥 Community');
  });

  document.getElementById('menuItemShare')?.addEventListener('click', () => {
    if (navigator.share) {
      navigator.share({
        title: 'MumbaiLocal Super Intelligent',
        text: 'Smart way to find your Mumbai Local with power of SI!',
        url: window.location.href
      }).catch(() => {});
    } else {
      showToast('📤 Share link copied');
    }
  });

  document.getElementById('menuItemGuide')?.addEventListener('click', () => {
    showToast('📖 Application User Guide');
  });

  document.getElementById('menuItemAdvertise')?.addEventListener('click', () => {
    showToast('📢 Contact for Advertise');
  });

  // Initial populate of drawer user info
  updateDrawerUserInfo();

  // ==========================================
  // 5. DATA INGESTION & MASTER DIRECTORY
  // ==========================================
  const LINE_STATIONS_MAP = {
    line_wr_suburban: [
      'CCG', 'MEL', 'CYR', 'GTR', 'MMCT', 'MX', 'PL', 'PBHD', 'DR', 'MRU',
      'MM', 'BA', 'KHAR', 'STC', 'VLP', 'ADH', 'JOS', 'RMAR', 'GMN', 'MDD',
      'KILE', 'BVI', 'DIC', 'MIRA', 'BYR', 'NIG', 'BSR', 'NSP', 'VR', 'VTN',
      'SAH', 'KLV', 'PLG', 'UOI', 'BOR', 'VGN', 'DRD'
    ],
    line_cr_main: [
      'CSMT', 'MSD', 'SNRD', 'BY', 'CHG', 'CRD', 'PR', 'DR', 'MTN', 'SIN',
      'CLA', 'VVH', 'GC', 'VK', 'KJRD', 'BND', 'NHU', 'MLND', 'TNA', 'KLVA',
      'MBQ', 'DIVA', 'KOPR', 'DI', 'THK', 'KYN', 'SHAD', 'ABY', 'TLW', 'KDV',
      'VSD', 'ASO', 'ATG', 'THS', 'KE', 'UMB', 'KSRA', 'VLDI', 'ULNR', 'ABH',
      'BUD', 'VGI', 'SHLU', 'NRL', 'BVS', 'KJT', 'PDI', 'KLY', 'DLV', 'LWJ',
      'KHPI'
    ],
    line_cr_harbour: [
      'CSMT', 'MSD', 'SNRD', 'DKRD', 'RRD', 'CTGN', 'SVE', 'VDLR', 'GTBN', 'CHF',
      'CLA', 'TKNG', 'CMBR', 'GV', 'MNKD', 'VSH', 'SNCR', 'JNJ', 'NEU', 'SWDV',
      'BEPR', 'KHAG', 'MANR', 'KNDS', 'PNVL', 'KCE', 'MM', 'BA', 'KHAR', 'STC',
      'VLP', 'ADH', 'JOS', 'RMAR', 'GMN'
    ],
    line_cr_trans_harbour: [
      'TNA', 'DIGHA', 'AIRL', 'RABE', 'GNSL', 'KPHN', 'TUH', 'SNCR', 'VSH', 'JNJ',
      'NEU', 'PNVL'
    ],
    line_cr_uran: [
      'NEU', 'BEPR', 'SGSG', 'TRGR', 'BMDR', 'KARP', 'GAVN', 'RJN', 'NHSV', 'DRGI',
      'URAN', 'JSI'
    ],
    line_cr_vasai_diva_panvel: [
      'BSR', 'JCNR', 'KARD', 'KHBV', 'BIRD', 'KOPR', 'DIVA', 'DTVL', 'NIIJ', 'TPND',
      'NVRD', 'KLMG', 'PNVL'
    ],
    line_cr_neral_matheran: [
      'NRL', 'JTT', 'WTP', 'AMNA', 'MAE'
    ],
    line_cr_pune_suburban: [
      'LNL', 'MVL', 'KMST', 'KNHE', 'VDN', 'TGN', 'GRWD', 'BGWI', 'DEHR', 'AKRD',
      'CCH', 'PMP', 'KSWD', 'DAPD', 'KK', 'SVJR', 'PUNE', 'TKW', 'MH', 'KND'
    ]
  };

  const LINE_NAMES = {
    line_wr_suburban: 'Western Line',
    line_cr_main: 'Central Main Line',
    line_cr_harbour: 'Harbour Line',
    line_cr_trans_harbour: 'Trans-Harbour Line',
    line_cr_uran: 'Uran Line',
    line_cr_vasai_diva_panvel: 'Vasai–Diva Line',
    line_cr_neral_matheran: 'Neral–Matheran Light Railway',
    line_cr_pune_suburban: 'Pune Suburban Line'
  };

  function getStationBadge(s, currentLine) {
    if (currentLine && currentLine !== 'all') {
      const badgeMap = {
        line_wr_suburban: { text: 'WR', bg: '#DC2626' },
        line_cr_main: { text: 'CR', bg: '#0284C7' },
        line_cr_harbour: { text: 'HB', bg: '#0D9488' },
        line_cr_trans_harbour: { text: 'TH', bg: '#D97706' },
        line_cr_uran: { text: 'UR', bg: '#059669' },
        line_cr_vasai_diva_panvel: { text: 'VD', bg: '#8B5CF6' },
        line_cr_neral_matheran: { text: 'MT', bg: '#15803D' },
        line_cr_pune_suburban: { text: 'PU', bg: '#4F46E5' }
      };
      const b = badgeMap[currentLine];
      if (b) return `<span class="line-tag-badge" style="background:${b.bg};">${b.text}</span>`;
    }
    return s.zone === 'WR'
      ? '<span class="line-tag-badge" style="background:#DC2626;">WR</span>'
      : '<span class="line-tag-badge" style="background:#0284C7;">CR</span>';
  }

  // ==========================================================================
  // AUTOMATIC STATION LOCALIZATION & "YOU ARE HERE" BADGE FEATURE
  // ==========================================================================
  // Default to Churchgate ('CCG') as shown in reference, or retrieve user's saved station
  let currentUserStationCode = localStorage.getItem('mumbai_user_current_station') || 'CCG';

  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function detectNearestStation(userLat, userLon) {
    if (!allStations || allStations.length === 0) return null;
    let closest = null;
    let minDistance = Infinity;

    for (const stn of allStations) {
      if (typeof stn.latitude === 'number' && typeof stn.longitude === 'number') {
        const dist = calculateDistanceKm(userLat, userLon, stn.latitude, stn.longitude);
        if (dist < minDistance) {
          minDistance = dist;
          closest = stn;
        }
      }
    }
    return closest;
  }

  function autoDetectUserLocation(userTriggered = false) {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          const nearest = detectNearestStation(latitude, longitude);
          if (nearest && nearest.station_code) {
            currentUserStationCode = nearest.station_code;
            localStorage.setItem('mumbai_user_current_station', nearest.station_code);
            renderStationDirectory(getStationsForDisplay());
            if (userTriggered) {
              showToast(`📍 Located at ${nearest.station_name} ("You are Here")`);
            }
          }
        },
        err => {
          console.warn('[Location] GPS unavailable or permission dismissed:', err.message);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
      );
    }
  }

  // Globally accessible so user or dev can set ANY station as "You are Here"
  window.setUserCurrentStation = function(codeOrName) {
    if (!allStations || allStations.length === 0) return;
    const target = allStations.find(s => 
      s.station_code.toUpperCase() === String(codeOrName).toUpperCase() ||
      s.station_name.toLowerCase() === String(codeOrName).toLowerCase() ||
      (s.id && s.id.toLowerCase() === String(codeOrName).toLowerCase())
    );
    if (target) {
      currentUserStationCode = target.station_code;
      localStorage.setItem('mumbai_user_current_station', target.station_code);
      renderStationDirectory(getStationsForDisplay());
      showToast(`📍 You are Here: ${target.station_name} (${target.station_code})`);
      return target;
    }
  };

  function getStationsForDisplay(searchQuery = '') {
    let list = allStations;

    if (activeLineFilter && activeLineFilter !== 'all' && LINE_STATIONS_MAP[activeLineFilter]) {
      const allowedCodes = LINE_STATIONS_MAP[activeLineFilter];
      const codeMap = new Map();
      allStations.forEach(s => codeMap.set(s.station_code.toUpperCase(), s));
      // Display strictly in the correct geographic sequence along the corridor
      list = allowedCodes.map(code => codeMap.get(code)).filter(Boolean);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const lineFiltered = list.filter(s => 
        s.station_name.toLowerCase().includes(q) || s.station_code.toLowerCase().includes(q)
      );
      if (lineFiltered.length > 0) {
        list = lineFiltered;
      } else {
        list = allStations.filter(s => 
          s.station_name.toLowerCase().includes(q) || s.station_code.toLowerCase().includes(q)
        );
      }
    }

    // Automatically place the current station ("You are here") at the very top (index 0)
    if (currentUserStationCode && list && list.length > 0) {
      const currCode = currentUserStationCode.toUpperCase();
      const currIdx = list.findIndex(s => s.station_code && s.station_code.toUpperCase() === currCode);
      if (currIdx > -1) {
        const currStation = list[currIdx];
        list = [currStation, ...list.slice(0, currIdx), ...list.slice(currIdx + 1)];
      } else if (!searchQuery) {
        // If current station belongs to another corridor, feature it at the top
        const found = allStations.find(s => s.station_code && s.station_code.toUpperCase() === currCode);
        if (found) {
          list = [found, ...list];
        }
      }
    }

    return list;
  }

  async function loadData() {
    try {
      // Load stations
      const stnRes = await fetch('/api/stations');
      allStations = (await stnRes.json()).map(s => {
        if (s.station_code === 'CSMT' || (s.station_name && s.station_name.toLowerCase().includes('chhatrapati shivaji'))) {
          s.station_name = 'CSMT';
          if (!s.aliases) s.aliases = [];
          if (!s.aliases.includes('Chhatrapati Shivaji Maharaj Terminus')) s.aliases.push('Chhatrapati Shivaji Maharaj Terminus');
          if (!s.aliases.includes('Chhatrapati Shivaji Terminus')) s.aliases.push('Chhatrapati Shivaji Terminus');
          if (!s.aliases.includes('VT')) s.aliases.push('VT');
          if (!s.aliases.includes('CST')) s.aliases.push('CST');
        }
        return s;
      });
      renderStationDirectory(getStationsForDisplay());

      // Attempt automatic real-time GPS detection in background
      autoDetectUserLocation(false);

      // Load lines
      const lineRes = await fetch('/api/lines');
      allLines = await lineRes.json();
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }
  loadData();

  // Render Station Directory List with "You are Here" badge on the active station
  function renderStationDirectory(stations) {
    const container = document.getElementById('stationDirectoryList');
    if (!container) return;

    if (!stations || stations.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No stations found</div>`;
      return;
    }

    const lineHeader = (activeLineFilter && activeLineFilter !== 'all' && LINE_NAMES[activeLineFilter])
      ? `<div style="display:flex; justify-content:space-between; align-items:center; padding: 0.4rem 0.6rem 0.6rem; color: var(--text-secondary); font-size: 0.78rem; font-weight: 700; border-bottom: 1px solid var(--border-subtle); margin-bottom: 0.35rem;">
           <span>${LINE_NAMES[activeLineFilter]}</span>
           <span style="color: var(--text-muted); font-size: 0.74rem;">${stations.length} Stations</span>
         </div>`
      : '';

    container.innerHTML = lineHeader + stations.map(s => {
      const zoneBadge = getStationBadge(s, activeLineFilter);
      const isUserHere = currentUserStationCode && s.station_code && s.station_code.toUpperCase() === currentUserStationCode.toUpperCase();
      const youAreHereBadge = isUserHere 
        ? `<span class="badge-you-are-here">
             <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
               <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7.13 11.4 7.44 11.66.33.28.8.28 1.13 0C12.87 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
             </svg>
             You are Here
           </span>`
        : '';

      return `
        <div class="station-list-row ${isUserHere ? 'is-current-station' : ''}" data-id="${s.id}" data-name="${s.station_name}" data-code="${s.station_code}">
          <div>
            <div class="station-row-name-wrap">
              <span class="station-row-name">${s.station_name}</span>
              ${youAreHereBadge}
            </div>
            <div class="station-row-meta">Code: ${s.station_code}</div>
          </div>
          <div>${zoneBadge}</div>
        </div>
      `;
    }).join('');

    // Attach row click listeners
    container.querySelectorAll('.station-list-row').forEach(row => {
      row.addEventListener('click', () => {
        const sId = row.getAttribute('data-id');
        const sName = row.getAttribute('data-name');
        handleStationSelection(sId, sName);
      });
    });
  }

  // Filter stations by Line
  const linePills = document.querySelectorAll('.line-chip');
  const quickRoutesRow = document.getElementById('quickRoutesRow');
  linePills.forEach(pill => {
    pill.addEventListener('click', () => {
      linePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      activeLineFilter = pill.getAttribute('data-line') || 'all';

      // Toggle quick routes row: show on 'all', hide on specific line for clean station focus
      if (quickRoutesRow) {
        quickRoutesRow.style.display = (activeLineFilter === 'all') ? 'flex' : 'none';
      }

      // Re-render station directory with ONLY that line's stations!
      const currentQuery = (fromInput?.value || toInput?.value || '').trim();
      renderStationDirectory(getStationsForDisplay(currentQuery));
    });
  });

  // Enable Smooth Left & Right Drag and Wheel Scrolling
  function enableHorizontalScroll(container) {
    if (!container) return;
    
    // Mouse wheel horizontal scrolling
    container.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        container.scrollLeft += e.deltaY * 0.9;
      }
    }, { passive: false });

    // Click & Drag to scroll both left and right
    let isDown = false;
    let startX = 0;
    let scrollStartLeft = 0;

    container.addEventListener('mousedown', (e) => {
      isDown = true;
      startX = e.pageX - container.offsetLeft;
      scrollStartLeft = container.scrollLeft;
      container.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      if (isDown) {
        isDown = false;
        container.style.cursor = 'grab';
      }
    });

    container.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX) * 1.4;
      container.scrollLeft = scrollStartLeft - walk;
    });
  }

  enableHorizontalScroll(document.getElementById('lineFilterRow'));
  enableHorizontalScroll(document.getElementById('quickRoutesRow'));

  // ==========================================
  // 6. JOURNEY PLANNER & TILE CENTER EXTENSION (Matching Image 1 & Image 2)
  // ==========================================
  const fromInput = document.getElementById('inputFromStation');
  const toInput = document.getElementById('inputToStation');
  const tileCenterExtension = document.getElementById('tileCenterExtension');
  const fromInputBox = document.getElementById('fromInputBox');
  const toInputBox = document.getElementById('toInputBox');

  // Default active selected tile is the upper tile ('from') as requested
  let activeSearchTile = 'from';

  function setActiveSearchTile(tile) {
    activeSearchTile = tile;
    const journeyBox = document.getElementById('journeySearchBox');
    if (tile === 'from') {
      fromInputBox?.classList.add('tile-active');
      toInputBox?.classList.remove('tile-active');
      journeyBox?.classList.add('active-from');
      journeyBox?.classList.remove('active-to');
    } else {
      toInputBox?.classList.add('tile-active');
      fromInputBox?.classList.remove('tile-active');
      journeyBox?.classList.add('active-to');
      journeyBox?.classList.remove('active-from');
    }
  }

  // Master Network Topology Movement Possibilities for all 158 stations
  const WR_CODES = ['CCG', 'MEL', 'CYR', 'GTR', 'MMCT', 'MX', 'PL', 'PBHD', 'DR', 'MRU', 'MM', 'BA', 'KHAR', 'STC', 'VLP', 'ADH', 'JOS', 'RMAR', 'GMN', 'MDD', 'KILE', 'BVI', 'DIC', 'MIRA', 'BYR', 'NIG', 'BSR', 'NSP', 'VR', 'VTN', 'SAH', 'KLV', 'PLG', 'UOI', 'BOR', 'VGN', 'DRD'];
  const CR_MAIN_CODES = ['CSMT', 'MSD', 'SNRD', 'BY', 'CHG', 'CRD', 'PR', 'DR', 'MTN', 'SIN', 'CLA', 'VVH', 'GC', 'VK', 'KJRD', 'BND', 'NHU', 'MLND', 'TNA', 'KLVA', 'MBQ', 'DIVA', 'KOPR', 'DI', 'THK', 'KYN', 'SHAD', 'ABY', 'TLW', 'KDV', 'VSD', 'ASO', 'ATG', 'THS', 'KE', 'UMB', 'KSRA', 'VLDI', 'ULNR', 'ABH', 'BUD', 'VGI', 'SHLU', 'NRL', 'BVS', 'KJT', 'PDI', 'KLY', 'DLV', 'LWJ', 'KHPI'];
  const HARBOUR_CODES = ['CSMT', 'MSD', 'SNRD', 'DKRD', 'RRD', 'CTGN', 'SVE', 'VDLR', 'GTBN', 'CHF', 'CLA', 'TKNG', 'CMBR', 'GV', 'MNKD', 'VSH', 'SNCR', 'JNJ', 'NEU', 'SWDV', 'BEPR', 'KHAG', 'MANR', 'KNDS', 'PNVL', 'KCE', 'MM', 'BA', 'KHAR', 'STC', 'VLP', 'ADH', 'JOS', 'RMAR', 'GMN'];
  const TRANS_HARBOUR_CODES = ['TNA', 'DIGHA', 'AIRL', 'RABE', 'GNSL', 'KPHN', 'TUH', 'SNCR', 'VSH', 'JNJ', 'NEU', 'PNVL'];
  const URAN_CODES = ['NEU', 'BEPR', 'SGSG', 'TRGR', 'BMDR', 'KARP', 'GAVN', 'RJN', 'NHSV', 'DRGI', 'URAN', 'JSI'];
  const VASAI_DIVA_CODES = ['BSR', 'JCNR', 'KARD', 'KHBV', 'BIRD', 'KOPR', 'DIVA', 'DTVL', 'NIIJ', 'TPND', 'NVRD', 'KLMG', 'PNVL'];
  const PUNE_CODES = ['LNL', 'MVL', 'KMST', 'KNHE', 'VDN', 'TGN', 'GRWD', 'BGWI', 'DEHR', 'AKRD', 'CCH', 'PMP', 'KSWD', 'DAPD', 'KK', 'SVJR', 'PUNE', 'TKW', 'MH', 'KND'];

  let selectedDirectionFilter = null;

  const SPECIAL_JUNCTIONS = {
    // Borivali (Western Line)
    stn_bvi: [
      { label: 'Virar / Dahanu', destName: 'Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Andheri / Bandra / Churchgate', destName: 'Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
    ],
    // Dadar (Major WR & CR interchange)
    stn_dr: [
      { label: 'Borivali / Virar / Dahanu (Western)', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Churchgate (Western)', destName: 'Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' },
      { label: 'Thane / Kalyan / Kasara / Karjat (Central)', destName: 'Thane / Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' },
      { label: 'Dadar / CSMT (Central)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' }
    ],
    // Kurla (CR Main & Harbour interchange)
    stn_cla: [
      { label: 'Thane / Kalyan / Kasara / Karjat (Central)', destName: 'Thane / Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' },
      { label: 'Dadar / CSMT (Central)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' },
      { label: 'Vashi / Belapur / Panvel (Harbour)', destName: 'Vashi / Belapur / Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Vadala / CSMT (Harbour)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' }
    ],
    // Thane (CR Main & Trans-Harbour interchange)
    stn_tna: [
      { label: 'Kalyan / Kasara / Karjat (Central)', destName: 'Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' },
      { label: 'Dadar / CSMT (Central)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' },
      { label: 'Vashi / Belapur / Panvel (Trans-Harbour)', destName: 'Vashi / Belapur / Panvel', direction: 'DN', lineId: 'line_cr_trans_harbour' }
    ],
    // Kalyan (CR Main Junction to Kasara & Karjat)
    stn_kyn: [
      { label: 'Titwala / Asangaon / Kasara', destName: 'Titwala / Asangaon / Kasara', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_KASARA' },
      { label: 'Badlapur / Karjat / Khopoli', destName: 'Badlapur / Karjat / Khopoli', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_KARJAT' },
      { label: 'Thane / Dadar / CSMT', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' }
    ],
    // CSMT (Central & Harbour Southern Terminal)
    stn_csmt: [
      { label: 'Thane / Kalyan / Kasara / Karjat (Central Main)', destName: 'Thane / Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' },
      { label: 'Vashi / Belapur / Panvel (Harbour Line)', destName: 'Vashi / Belapur / Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Bandra / Andheri / Goregaon (Harbour Line)', destName: 'Bandra / Andheri / Goregaon', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_GOREGAON' }
    ],
    // Masjid (Central Main & Harbour)
    stn_msd: [
      { label: 'Thane / Kalyan / Kasara / Karjat (Central Main)', destName: 'Thane / Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' },
      { label: 'CSMT (Central Main)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' },
      { label: 'Vashi / Belapur / Panvel (Harbour Line)', destName: 'Vashi / Belapur / Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Bandra / Andheri / Goregaon (Harbour Line)', destName: 'Bandra / Andheri / Goregaon', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_GOREGAON' },
      { label: 'CSMT (Harbour Line)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' }
    ],
    // Sandhurst Road (Central Main & Harbour junction)
    stn_snrd: [
      { label: 'Thane / Kalyan / Kasara / Karjat (Central Main)', destName: 'Thane / Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' },
      { label: 'CSMT (Central Main)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' },
      { label: 'Vashi / Belapur / Panvel (Harbour Line)', destName: 'Vashi / Belapur / Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Bandra / Andheri / Goregaon (Harbour Line)', destName: 'Bandra / Andheri / Goregaon', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_GOREGAON' },
      { label: 'CSMT (Harbour Line)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' }
    ],
    // Churchgate (Western Line Southern Terminal)
    stn_ccg: [
      { label: 'Borivali / Virar / Dahanu (Western Line)', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' }
    ],
    // Virar
    stn_vr: [
      { label: 'Dahanu Road (Western Line)', destName: 'Dahanu Road', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Borivali / Churchgate (Western Line)', destName: 'Borivali / Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
    ],
    // Dahanu Road
    stn_drd: [
      { label: 'Virar / Churchgate (Western Line)', destName: 'Virar / Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
    ],
    // Andheri (Western & Harbour)
    stn_adh: [
      { label: 'Borivali / Virar / Dahanu (Western)', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Bandra / Churchgate (Western)', destName: 'Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' },
      { label: 'Vadala / CSMT / Panvel (Harbour)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' }
    ],
    // Bandra (Western & Harbour)
    stn_ba: [
      { label: 'Borivali / Virar / Dahanu (Western)', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Churchgate (Western)', destName: 'Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' },
      { label: 'Vadala / CSMT / Panvel (Harbour)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' }
    ],
    // Mahim (Western & Harbour)
    stn_mm: [
      { label: 'Borivali / Virar / Dahanu (Western)', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Churchgate (Western)', destName: 'Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' },
      { label: 'Bandra / Andheri / Goregaon (Harbour)', destName: 'Bandra / Andheri / Goregaon', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_GOREGAON' },
      { label: 'Vadala / CSMT (Harbour)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' }
    ],
    // Goregaon (Western & Harbour)
    stn_gmn: [
      { label: 'Borivali / Virar / Dahanu (Western)', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Andheri / Bandra / Churchgate (Western)', destName: 'Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' },
      { label: 'Vadala / CSMT (Harbour Line)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' }
    ],
    // King's Circle (Harbour branch)
    stn_kce: [
      { label: 'Bandra / Andheri / Goregaon (Harbour)', destName: 'Bandra / Andheri / Goregaon', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_GOREGAON' },
      { label: 'Vadala / CSMT (Harbour)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' }
    ],
    // Panvel (Harbour, Trans-Harbour, Vasai-Diva terminal)
    stn_pnvl: [
      { label: 'Vashi / Vadala / CSMT (Harbour Line)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' },
      { label: 'Thane (Trans-Harbour Line)', destName: 'Thane', direction: 'UP', lineId: 'line_cr_trans_harbour' },
      { label: 'Diva / Vasai Road (MEMU)', destName: 'Vasai Road', direction: 'UP', lineId: 'line_cr_vasai_diva_panvel' }
    ],
    // Diva Junction
    stn_diva: [
      { label: 'Kalyan / Kasara / Karjat (Central)', destName: 'Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' },
      { label: 'Thane / CSMT (Central)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' },
      { label: 'Vasai Road (MEMU)', destName: 'Vasai Road', direction: 'UP', lineId: 'line_cr_vasai_diva_panvel' },
      { label: 'Panvel (MEMU)', destName: 'Panvel', direction: 'DN', lineId: 'line_cr_vasai_diva_panvel' }
    ],
    // Vasai Road (WR & Vasai-Diva interchange)
    stn_bsr: [
      { label: 'Virar / Dahanu (Western)', destName: 'Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Borivali / Churchgate (Western)', destName: 'Borivali / Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' },
      { label: 'Diva / Panvel (MEMU)', destName: 'Panvel', direction: 'DN', lineId: 'line_cr_vasai_diva_panvel' }
    ],
    // Vadala Road (Harbour branch junction)
    stn_vdlr: [
      { label: 'Vashi / Belapur / Panvel (Harbour)', destName: 'Vashi / Belapur / Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Bandra / Andheri / Goregaon (Harbour)', destName: 'Bandra / Andheri / Goregaon', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_GOREGAON' },
      { label: 'CSMT (Harbour)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' }
    ],
    // Nerul (Harbour, Trans-Harbour, Uran interchange)
    stn_neu: [
      { label: 'Panvel (Harbour Line)', destName: 'Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Vashi / CSMT (Harbour Line)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' },
      { label: 'Thane (Trans-Harbour Line)', destName: 'Thane', direction: 'UP', lineId: 'line_cr_trans_harbour' },
      { label: 'Uran / Dronagiri', destName: 'Uran / Dronagiri', direction: 'DN', lineId: 'line_cr_uran' }
    ],
    // Belapur
    stn_bepr: [
      { label: 'Panvel (Harbour Line)', destName: 'Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Vashi / CSMT (Harbour Line)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' },
      { label: 'Thane (Trans-Harbour Line)', destName: 'Thane', direction: 'UP', lineId: 'line_cr_trans_harbour' },
      { label: 'Uran / Dronagiri', destName: 'Uran / Dronagiri', direction: 'DN', lineId: 'line_cr_uran' }
    ],
    // Vashi (Harbour & Trans-Harbour)
    stn_vsh: [
      { label: 'Belapur / Panvel (Harbour / Trans-Harbour)', destName: 'Belapur / Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Vadala / CSMT (Harbour Line)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' },
      { label: 'Thane (Trans-Harbour Line)', destName: 'Thane', direction: 'UP', lineId: 'line_cr_trans_harbour' }
    ],
    // Sanpada & Juinagar
    stn_sncr: [
      { label: 'Belapur / Panvel (Harbour / Trans-Harbour)', destName: 'Belapur / Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Vashi / Vadala / CSMT (Harbour)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' },
      { label: 'Thane (Trans-Harbour)', destName: 'Thane', direction: 'UP', lineId: 'line_cr_trans_harbour' }
    ],
    stn_jnj: [
      { label: 'Belapur / Panvel (Harbour / Trans-Harbour)', destName: 'Belapur / Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Vashi / Vadala / CSMT (Harbour)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' },
      { label: 'Thane (Trans-Harbour)', destName: 'Thane', direction: 'UP', lineId: 'line_cr_trans_harbour' }
    ],
    // Seawoods - Darave
    stn_swdv: [
      { label: 'Belapur / Panvel (Harbour Line)', destName: 'Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
      { label: 'Uran / Dronagiri (Uran Line)', destName: 'Uran / Dronagiri', direction: 'DN', lineId: 'line_cr_uran' },
      { label: 'Vashi / CSMT (Harbour Line)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' },
      { label: 'Thane (Trans-Harbour Line)', destName: 'Thane', direction: 'UP', lineId: 'line_cr_trans_harbour' }
    ],
    // Dombivli
    stn_di: [
      { label: 'Kalyan / Kasara / Karjat (Central)', destName: 'Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' },
      { label: 'Thane / Dadar / CSMT (Central)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' }
    ],
    // Ghatkopar
    stn_gc: [
      { label: 'Thane / Kalyan / Kasara / Karjat (Central)', destName: 'Thane / Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' },
      { label: 'Dadar / CSMT (Central)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' }
    ],
    // Neral (Central Main & Matheran)
    stn_nrl: [
      { label: 'Karjat / Khopoli (Central Main)', destName: 'Karjat / Khopoli', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_KARJAT' },
      { label: 'Kalyan / CSMT (Central Main)', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' },
      { label: 'Matheran (Toy Train)', destName: 'Matheran', direction: 'DN', lineId: 'line_cr_neral_matheran' }
    ],
    // Matheran
    stn_mae: [
      { label: 'Neral Junction', destName: 'Neral', direction: 'UP', lineId: 'line_cr_neral_matheran' }
    ],
    // Pune Junction
    stn_pune: [
      { label: 'Talegaon / Lonavala', destName: 'Lonavala', direction: 'UP', lineId: 'line_cr_pune_suburban' }
    ],
    // Lonavala
    stn_lnl: [
      { label: 'Shivajinagar / Pune Junction', destName: 'Pune Junction', direction: 'DN', lineId: 'line_cr_pune_suburban' }
    ],
    // Kasara
    stn_ksra: [
      { label: 'Kalyan / CSMT', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' }
    ],
    // Karjat
    stn_kjt: [
      { label: 'Khopoli', destName: 'Khopoli', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_KHOPOLI' },
      { label: 'Kalyan / CSMT', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' }
    ],
    // Khopoli
    stn_khpi: [
      { label: 'Karjat / Kalyan / CSMT', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' }
    ],
    // Uran
    stn_uran: [
      { label: 'Nerul / Belapur / CSMT', destName: 'Nerul / Belapur', direction: 'UP', lineId: 'line_cr_uran' }
    ]
  };

  function getStationMovementPossibilities(stationId) {
    if (SPECIAL_JUNCTIONS[stationId]) return SPECIAL_JUNCTIONS[stationId];
    const station = allStations.find(s => s.id === stationId);
    if (!station) return [];
    const code = (station.station_code || '').toUpperCase();

    const results = [];
    const seenKeys = new Set();

    function addPossibility(p) {
      const key = `${p.direction}_${p.lineId}_${p.corridor || ''}_${p.label}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push(p);
      }
    }

    // 1. Central Main Line
    const crIdx = CR_MAIN_CODES.indexOf(code);
    if (crIdx !== -1) {
      if (crIdx <= 25) { // CSMT to Kalyan
        addPossibility({
          label: 'Thane / Kalyan / Kasara / Karjat (Central Main)',
          destName: 'Thane / Kalyan / Kasara / Karjat',
          direction: 'DN',
          lineId: 'line_cr_main',
          corridor: 'CR_NORTH'
        });
        if (crIdx > 0) {
          addPossibility({
            label: 'Dadar / CSMT (Central Main)',
            destName: 'CSMT',
            direction: 'UP',
            lineId: 'line_cr_main',
            corridor: 'CR_SOUTH'
          });
        }
      } else if (crIdx <= 36) { // Shahad to Kasara
        if (crIdx < 36) {
          addPossibility({
            label: 'Asangaon / Kasara (Central Main)',
            destName: 'Asangaon / Kasara',
            direction: 'DN',
            lineId: 'line_cr_main',
            corridor: 'CR_KASARA'
          });
        }
        addPossibility({
          label: 'Kalyan / CSMT (Central Main)',
          destName: 'CSMT',
          direction: 'UP',
          lineId: 'line_cr_main',
          corridor: 'CR_SOUTH'
        });
      } else { // Vithalwadi to Khopoli
        if (crIdx < 50) {
          addPossibility({
            label: 'Karjat / Khopoli (Central Main)',
            destName: 'Karjat / Khopoli',
            direction: 'DN',
            lineId: 'line_cr_main',
            corridor: 'CR_KARJAT'
          });
        }
        addPossibility({
          label: 'Kalyan / CSMT (Central Main)',
          destName: 'CSMT',
          direction: 'UP',
          lineId: 'line_cr_main',
          corridor: 'CR_SOUTH'
        });
      }
    }

    // 2. Western Line
    const wrIdx = WR_CODES.indexOf(code);
    if (wrIdx !== -1) {
      if (wrIdx < 21) { // Churchgate to Kandivali
        addPossibility({
          label: 'Borivali / Virar / Dahanu (Western Line)',
          destName: 'Borivali / Virar / Dahanu',
          direction: 'DN',
          lineId: 'line_wr_suburban',
          corridor: 'WR_NORTH'
        });
        if (wrIdx > 0) {
          addPossibility({
            label: 'Churchgate (Western Line)',
            destName: 'Churchgate',
            direction: 'UP',
            lineId: 'line_wr_suburban',
            corridor: 'WR_SOUTH'
          });
        }
      } else if (wrIdx < 28) { // Borivali to Nallasopara
        addPossibility({
          label: 'Virar / Dahanu Road (Western Line)',
          destName: 'Virar / Dahanu Road',
          direction: 'DN',
          lineId: 'line_wr_suburban',
          corridor: 'WR_NORTH'
        });
        addPossibility({
          label: 'Borivali / Churchgate (Western Line)',
          destName: 'Borivali / Churchgate',
          direction: 'UP',
          lineId: 'line_wr_suburban',
          corridor: 'WR_SOUTH'
        });
      } else { // Virar to Dahanu Road
        if (wrIdx < 36) {
          addPossibility({
            label: 'Dahanu Road (Western Line)',
            destName: 'Dahanu Road',
            direction: 'DN',
            lineId: 'line_wr_suburban',
            corridor: 'WR_NORTH'
          });
        }
        addPossibility({
          label: 'Virar / Churchgate (Western Line)',
          destName: 'Virar / Churchgate',
          direction: 'UP',
          lineId: 'line_wr_suburban',
          corridor: 'WR_SOUTH'
        });
      }
    }

    // 3. Harbour Line
    if (HARBOUR_CODES.includes(code)) {
      const hbWest = ['KCE', 'MM', 'BA', 'KHAR', 'STC', 'VLP', 'ADH', 'JOS', 'RMAR', 'GMN'].includes(code);
      if (hbWest) {
        if (code !== 'GMN') {
          addPossibility({
            label: 'Bandra / Andheri / Goregaon (Harbour Line)',
            destName: 'Bandra / Andheri / Goregaon',
            direction: 'DN',
            lineId: 'line_cr_harbour',
            corridor: 'HB_GOREGAON'
          });
        }
        addPossibility({
          label: 'Vadala / CSMT (Harbour Line)',
          destName: 'CSMT',
          direction: 'UP',
          lineId: 'line_cr_harbour',
          corridor: 'HB_CSMT'
        });
      } else {
        if (code !== 'PNVL') {
          addPossibility({
            label: 'Vashi / Belapur / Panvel (Harbour Line)',
            destName: 'Vashi / Belapur / Panvel',
            direction: 'DN',
            lineId: 'line_cr_harbour',
            corridor: 'HB_PANVEL'
          });
        }
        if (code !== 'CSMT') {
          addPossibility({
            label: 'Vadala / CSMT (Harbour Line)',
            destName: 'CSMT',
            direction: 'UP',
            lineId: 'line_cr_harbour',
            corridor: 'HB_CSMT'
          });
        }
      }
    }

    // 4. Trans-Harbour Line
    if (TRANS_HARBOUR_CODES.includes(code)) {
      if (code !== 'PNVL' && code !== 'VSH') {
        addPossibility({
          label: 'Vashi / Belapur / Panvel (Trans-Harbour)',
          destName: 'Vashi / Belapur / Panvel',
          direction: 'DN',
          lineId: 'line_cr_trans_harbour'
        });
      }
      if (code !== 'TNA') {
        addPossibility({
          label: 'Thane (Trans-Harbour)',
          destName: 'Thane',
          direction: 'UP',
          lineId: 'line_cr_trans_harbour'
        });
      }
    }

    // 5. Uran Line
    if (URAN_CODES.includes(code)) {
      if (code !== 'URAN') {
        addPossibility({
          label: 'Uran / Dronagiri (Uran Line)',
          destName: 'Uran / Dronagiri',
          direction: 'DN',
          lineId: 'line_cr_uran'
        });
      }
      if (code !== 'NEU' && code !== 'BEPR') {
        addPossibility({
          label: 'Nerul / Belapur (Uran Line)',
          destName: 'Nerul / Belapur',
          direction: 'UP',
          lineId: 'line_cr_uran'
        });
      }
    }

    // 6. Vasai-Diva-Panvel MEMU
    if (VASAI_DIVA_CODES.includes(code)) {
      if (code !== 'PNVL') {
        addPossibility({
          label: 'Diva / Panvel (MEMU)',
          destName: 'Panvel',
          direction: 'DN',
          lineId: 'line_cr_vasai_diva_panvel'
        });
      }
      if (code !== 'BSR') {
        addPossibility({
          label: 'Diva / Vasai Road (MEMU)',
          destName: 'Vasai Road',
          direction: 'UP',
          lineId: 'line_cr_vasai_diva_panvel'
        });
      }
    }

    // 7. Pune Suburban
    if (PUNE_CODES.includes(code)) {
      if (code !== 'PUNE' && code !== 'KND') {
        addPossibility({
          label: 'Shivajinagar / Pune Junction',
          destName: 'Pune Junction',
          direction: 'DN',
          lineId: 'line_cr_pune_suburban'
        });
      }
      if (code !== 'LNL') {
        addPossibility({
          label: 'Talegaon / Lonavala',
          destName: 'Lonavala',
          direction: 'UP',
          lineId: 'line_cr_pune_suburban'
        });
      }
    }

    if (results.length > 0) return results;

    // Fallback default
    return [
      { label: 'Borivali / Virar / Dahanu (Western Line)', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Churchgate (Western Line)', destName: 'Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
    ];
  }

  function showTileCenterDirections(stationId) {
    if (!tileCenterExtension) return;
    const possibilities = getStationMovementPossibilities(stationId);
    if (!possibilities || possibilities.length === 0) {
      tileCenterExtension.classList.remove('expanded');
      tileCenterExtension.innerHTML = '';
      return;
    }

    tileCenterExtension.innerHTML = possibilities.map((p, idx) => `
      <div class="direction-possibility-item" data-idx="${idx}">
        <span class="direction-arrow">→</span>
        <span class="direction-label">${p.label}</span>
      </div>
    `).join('');

    // Attach click listener to each possibility
    tileCenterExtension.querySelectorAll('.direction-possibility-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(item.getAttribute('data-idx'), 10);
        const p = possibilities[idx];
        if (p) handleDirectionSelected(p);
      });
    });

    // Expand center extension smoothly (Image 2!)
    tileCenterExtension.classList.add('expanded');
  }

  // Resolve station object if user typed station name or code
  function resolveStationFromInput(val) {
    if (!val || typeof val !== 'string') return null;
    const clean = val.toLowerCase().trim();
    if (!clean) return null;

    // 1. Try comprehensive station entity resolver with alias & code matching
    try {
      const entity = resolveVoiceStationEntity(clean);
      if (entity) return entity;
    } catch (e) {}

    // 2. Exact match in allStations
    const exact = (allStations || []).find(s => 
      s.station_name.toLowerCase() === clean || 
      (s.station_code && s.station_code.toLowerCase() === clean)
    );
    if (exact) return exact;

    // 3. Prefix match
    const startsWith = (allStations || []).find(s =>
      s.station_name.toLowerCase().startsWith(clean)
    );
    if (startsWith) return startsWith;

    // 4. Substring match
    return (allStations || []).find(s =>
      s.station_name.toLowerCase().includes(clean)
    ) || null;
  }

  // Smoothly Show/Hide the "Show Trains & Schedules" Proceed Button
  function checkShowResultsButton() {
    const fromVal = (fromInput?.value || '').trim();
    const toVal = (toInput?.value || '').trim();
    const isBothFilled = fromVal.length > 0 && toVal.length > 0;

    const wrap = document.getElementById('searchProceedWrap');
    if (wrap) {
      wrap.classList.toggle('visible', isBothFilled);
    }
  }
  checkShowResultsButton();

  function handleDirectionSelected(possibility) {
    selectedDirectionFilter = possibility;
    selectedToStation = {
      id: possibility.destId || 'dir_' + (possibility.direction || 'DN'),
      name: possibility.destName || possibility.label
    };
    if (toInput) toInput.value = possibility.destName || possibility.label;

    // Smoothly collapse center extension so tiles remain stuck together
    if (tileCenterExtension) {
      tileCenterExtension.classList.remove('expanded');
    }

    setActiveSearchTile('to');
    updateSearchClearIcons();
    checkShowResultsButton();

    // Trigger search and display all trains moving towards that direction!
    searchTrains();
  }

  // Handle station selection from station directory
  function handleStationSelection(stationId, stationName) {
    if (activeSearchTile === 'to') {
      setToStation(stationId, stationName);
    } else {
      setFromStation(stationId, stationName);
      // Seamlessly transition selection to To tile
      setActiveSearchTile('to');
    }
  }

  function setFromStation(stationId, stationName) {
    selectedFromStation = { id: stationId, name: stationName };
    selectedDirectionFilter = null;
    if (fromInput) fromInput.value = stationName;

    // Clear previous To station when selecting new From station
    selectedToStation = null;
    if (toInput) toInput.value = '';

    updateSearchClearIcons();
    checkShowResultsButton();

    // Show center extension with the movement possibilities from this station (Image 2!)
    showTileCenterDirections(stationId);

    // Keep station directory filtered excluding origin
    renderStationDirectory(getStationsForDisplay().filter(s => s.id !== stationId));
  }

  function setToStation(stationId, stationName) {
    selectedToStation = { id: stationId, name: stationName };
    selectedDirectionFilter = null;
    if (toInput) toInput.value = stationName;

    updateSearchClearIcons();
    checkShowResultsButton();

    if (tileCenterExtension) {
      tileCenterExtension.classList.remove('expanded');
    }
    searchTrains();
  }

  // Update Search Icon to "X" Cancel Button when input has text
  const fromSearchIconBtn = document.getElementById('fromSearchIconBtn');
  const toSearchIconBtn = document.getElementById('toSearchIconBtn');

  function updateSearchClearIcons() {
    const fromHasText = Boolean(fromInput && fromInput.value.trim().length > 0);
    const toHasText = Boolean(toInput && toInput.value.trim().length > 0);

    if (fromSearchIconBtn) {
      fromSearchIconBtn.classList.toggle('has-clear', fromHasText);
      fromSearchIconBtn.setAttribute('title', fromHasText ? 'Clear text' : 'Search station');
    }

    if (toSearchIconBtn) {
      toSearchIconBtn.classList.toggle('has-clear', toHasText);
      toSearchIconBtn.setAttribute('title', toHasText ? 'Clear text' : 'Search destination');
    }
  }

  // Click on 'X' Cancel button to clear the written text
  fromSearchIconBtn?.addEventListener('click', (e) => {
    if (fromSearchIconBtn.classList.contains('has-clear')) {
      e.stopPropagation();
      fromInput.value = '';
      selectedFromStation = null;
      selectedDirectionFilter = null;
      if (tileCenterExtension) {
        tileCenterExtension.classList.remove('expanded');
        tileCenterExtension.innerHTML = '';
      }
      setActiveSearchTile('from'); // Default upper tile selected
      updateSearchClearIcons();
      checkShowResultsButton();
      renderStationDirectory(getStationsForDisplay());
      fromInput.focus();
    }
  });

  toSearchIconBtn?.addEventListener('click', (e) => {
    if (toSearchIconBtn.classList.contains('has-clear')) {
      e.stopPropagation();
      toInput.value = '';
      selectedToStation = null;
      selectedDirectionFilter = null;
      setActiveSearchTile('to');
      updateSearchClearIcons();
      checkShowResultsButton();
      const filtered = selectedFromStation 
        ? getStationsForDisplay().filter(s => s.id !== selectedFromStation.id)
        : getStationsForDisplay();
      renderStationDirectory(filtered);
      toInput.focus();
    }
  });

  // Clicking on Upper tile ('From') selects it and turns it Purple
  fromInputBox?.addEventListener('click', (e) => {
    if (e.target.closest('#btnSwapOrLocate') || e.target.closest('#fromSearchIconBtn')) return;
    setActiveSearchTile('from');
    fromInput?.focus();
    if (selectedFromStation && tileCenterExtension && !tileCenterExtension.classList.contains('expanded')) {
      showTileCenterDirections(selectedFromStation.id);
    } else if (!selectedFromStation) {
      renderStationDirectory(getStationsForDisplay(fromInput?.value?.trim() || ''));
    }
  });

  fromInput?.addEventListener('focus', () => {
    setActiveSearchTile('from');
    if (selectedFromStation && tileCenterExtension && !tileCenterExtension.classList.contains('expanded')) {
      showTileCenterDirections(selectedFromStation.id);
    } else if (!selectedFromStation) {
      renderStationDirectory(getStationsForDisplay(fromInput?.value?.trim() || ''));
    }
  });

  // Clicking on Lower tile ('To') selects it and turns it Purple
  toInputBox?.addEventListener('click', (e) => {
    if (e.target.closest('#toSearchIconBtn')) return;
    setActiveSearchTile('to');
    toInput?.focus();
    // KEEP the suggestions drawer open! (User requirement: even user touches the below "To" still keep the suggestions drawer open)
    if (selectedFromStation && tileCenterExtension && !tileCenterExtension.classList.contains('expanded')) {
      showTileCenterDirections(selectedFromStation.id);
    }
    const currentQuery = (toInput?.value || '').trim();
    const filtered = selectedFromStation 
      ? getStationsForDisplay(currentQuery).filter(s => s.id !== selectedFromStation.id)
      : getStationsForDisplay(currentQuery);
    renderStationDirectory(filtered);
  });

  toInput?.addEventListener('focus', () => {
    setActiveSearchTile('to');
    // KEEP suggestions drawer open when touching or focusing To!
    if (selectedFromStation && tileCenterExtension && !tileCenterExtension.classList.contains('expanded')) {
      showTileCenterDirections(selectedFromStation.id);
    }
    const currentQuery = (toInput?.value || '').trim();
    const filtered = selectedFromStation 
      ? getStationsForDisplay(currentQuery).filter(s => s.id !== selectedFromStation.id)
      : getStationsForDisplay(currentQuery);
    renderStationDirectory(filtered);
  });

  // Quick Route Suggestion Chips Click
  document.querySelectorAll('.route-shortcut-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const fromId = chip.getAttribute('data-from');
      const toId = chip.getAttribute('data-to');
      const fromStn = allStations.find(s => s.id === fromId);
      const toStn = allStations.find(s => s.id === toId);

      if (fromStn && toStn) {
        selectedFromStation = { id: fromStn.id, name: fromStn.station_name };
        selectedToStation = { id: toStn.id, name: toStn.station_name };
        selectedDirectionFilter = null;
        if (fromInput) fromInput.value = fromStn.station_name;
        if (toInput) toInput.value = toStn.station_name;
        updateSearchClearIcons();
        checkShowResultsButton();
        if (tileCenterExtension) tileCenterExtension.classList.remove('expanded');
        setActiveSearchTile('to');
        searchTrains();
      }
    });
  });

  // Swap / Location Button
  document.getElementById('btnSwapOrLocate')?.addEventListener('click', () => {
    if (selectedFromStation && selectedToStation) {
      const temp = selectedFromStation;
      selectedFromStation = selectedToStation;
      selectedToStation = temp;
      selectedDirectionFilter = null;
      fromInput.value = selectedFromStation.name;
      toInput.value = selectedToStation.name;
      updateSearchClearIcons();
      checkShowResultsButton();
      if (tileCenterExtension) tileCenterExtension.classList.remove('expanded');
      setActiveSearchTile('to');
      searchTrains();
    } else {
      // Set user's current detected station ("You are Here")
      const currStn = (allStations && currentUserStationCode)
        ? allStations.find(s => s.station_code && s.station_code.toUpperCase() === currentUserStationCode.toUpperCase())
        : (allStations && allStations.find(s => s.id === 'stn_ccg')) || { id: 'stn_ccg', station_name: 'Churchgate' };
      
      if (currStn) {
        setFromStation(currStn.id, currStn.station_name);
        setActiveSearchTile('to');
        checkShowResultsButton();
        showToast(`📍 Located at: ${currStn.station_name} ("You are Here")`);
      }
      autoDetectUserLocation(true);
    }
  });

  // Search filter as user types in From / To
  fromInput?.addEventListener('input', (e) => {
    setActiveSearchTile('from');
    updateSearchClearIcons();
    checkShowResultsButton();
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      selectedFromStation = null;
      if (tileCenterExtension) {
        tileCenterExtension.classList.remove('expanded');
      }
    }
    renderStationDirectory(getStationsForDisplay(q));
  });

  toInput?.addEventListener('input', (e) => {
    setActiveSearchTile('to');
    selectedDirectionFilter = null;
    updateSearchClearIcons();
    checkShowResultsButton();
    const q = e.target.value.toLowerCase().trim();
    const list = selectedFromStation 
      ? getStationsForDisplay(q).filter(s => s.id !== selectedFromStation.id)
      : getStationsForDisplay(q);
    renderStationDirectory(list);
  });

  // Process / Show Results Button Click Handler
  function handleProceedToResults() {
    if (!selectedFromStation && fromInput?.value?.trim()) {
      selectedFromStation = resolveStationFromInput(fromInput.value.trim()) || {
        id: 'stn_custom_from',
        name: fromInput.value.trim()
      };
    }
    if (!selectedToStation && toInput?.value?.trim()) {
      selectedToStation = resolveStationFromInput(toInput.value.trim()) || {
        id: 'stn_custom_to',
        name: toInput.value.trim()
      };
    }

    if (selectedFromStation && selectedToStation) {
      searchTrains();
    } else if (!selectedFromStation) {
      setActiveSearchTile('from');
      fromInput?.focus();
    } else if (!selectedToStation) {
      setActiveSearchTile('to');
      toInput?.focus();
    }
  }

  document.getElementById('btnProceedResults')?.addEventListener('click', handleProceedToResults);

  // Enter key press triggers search if inputs are filled
  fromInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (toInput?.value?.trim()) {
        handleProceedToResults();
      } else {
        setActiveSearchTile('to');
        toInput?.focus();
      }
    }
  });

  toInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (fromInput?.value?.trim() && toInput?.value?.trim()) {
        handleProceedToResults();
      }
    }
  });

  // ==========================================
  // 7. LIVE TRAIN TIMETABLE RESULTS & ARCHITECTURE (Matching Image 1 & Image 2)
  // Segregation Architecture:
  // - Red: Fast locals
  // - Green: Slow locals
  // - Full Dark Blue Background: AC locals (with AC badge in bright blue)
  // Single Tile Information (Image 2):
  // - Top Row: [Destination/Speed] [Departure Time 05:45 AM]
  // - Bottom Row: [Route: Origin - Terminus] [Platform: PF: 03]
  // - Real-time Arrival states:
  //   * 1 min remaining -> Arriving in 1m (Active Arrival Animation)
  //   * 0 min (match) -> Arrived (Active Arrival Animation)
  //   * past time -> Back schedule, Arrival Animation removed
  // ==========================================
  let currentTrainResults = [];
  let sortedCurrentTrains = [];
  let currentTimetableFilter = 'ALL';
  let lastClockMinute = null;

  // 12-Hour AM/PM Time Format for Digital Clock Ticker
  function formatClock12(date) {
    let h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    const hh = String(h).padStart(2, '0');
    return `${hh}:${m}:${s} ${ampm}`;
  }

  function updateLiveClockBanner() {
    const clockDisplay = document.getElementById('liveClockDisplay');
    const pulse = document.getElementById('liveClockPulse');
    if (!clockDisplay) return;

    const d = getMumbaiLiveDate();
    clockDisplay.textContent = formatClock12(d);

    if (pulse) {
      pulse.classList.toggle('is-simulated', simulatedMinutesOffset !== null);
      pulse.setAttribute('title', simulatedMinutesOffset !== null ? 'Simulated Development Time' : 'Connected to Live Mumbai Time');
    }
  }

  // Live second-by-second ticker
  setInterval(() => {
    updateLiveClockBanner();
    const currentMin = getActiveCurrentMinutes();
    if (lastClockMinute !== null && lastClockMinute !== currentMin) {
      lastClockMinute = currentMin;
      const resultsScreen = document.getElementById('screen-train-results');
      if (resultsScreen && resultsScreen.classList.contains('active') && currentTrainResults.length > 0) {
        renderTimetableTiles(getFilteredTrains(), false /* keep user scroll position */);
      }
    } else if (lastClockMinute === null) {
      lastClockMinute = currentMin;
    }

    // Live update all arrival countdown badges every second without full DOM redraw!
    updateTimetableArrivalTickers();

    // Check train journey live position every second (only re-renders if station/transit state changes)
    const journeyScreen = document.getElementById('screen-train-journey');
    if (journeyScreen && journeyScreen.classList.contains('active') && currentJourneyStops.length > 0 && activeJourneyTrain) {
      refreshJourneyCurrentStop(false);
    }
  }, 1000);

  // Standard Station Display Name Normalizer (Everywhere name "Chhatrapati Shivaji Maharaj Terminus" as "CSMT")
  function formatStationDisplayName(name) {
    if (!name) return '';
    let s = String(name).trim();
    if (s.toLowerCase().includes('chhatrapati shivaji') || s.toUpperCase() === 'CSMT' || s.toUpperCase() === 'CST' || s.toUpperCase() === 'VT') {
      return 'CSMT';
    }
    return s.replace(' Road', '').replace(' Suburban', '');
  }

  // 12-Hour AM/PM Formatter for Train Timetable Tiles
  function formatTime12(timeStr) {
    if (!timeStr) return { hhmm: '12:00', ampm: 'AM' };
    const parts = String(timeStr).split(':');
    let h = parseInt(parts[0], 10) || 0;
    const m = (parts[1] || '00').padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    const hh = String(h).padStart(2, '0');
    return { hhmm: `${hh}:${m}`, ampm };
  }

  function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  }

  // Mumbai Suburban Railway Service Day:
  // Starts early morning (03:30 AM) and runs through midnight to late night (02:30 AM).
  const SERVICE_DAY_START_MINUTES = 210; // 03:30 AM
  const SERVICE_DAY_START_SECONDS = 210 * 60; // 12600 seconds

  function parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return h * 3600 + m * 60 + s;
  }

  function getServiceDayMinutes(timeStrOrMinutes) {
    let m = typeof timeStrOrMinutes === 'number' ? timeStrOrMinutes : parseTimeToMinutes(timeStrOrMinutes);
    return m < SERVICE_DAY_START_MINUTES ? m + 1440 : m;
  }

  function getServiceDaySeconds(timeStrOrSeconds) {
    let s = typeof timeStrOrSeconds === 'number' ? timeStrOrSeconds : parseTimeToSeconds(timeStrOrSeconds);
    return s < SERVICE_DAY_START_SECONDS ? s + 86400 : s;
  }

  function getActiveCurrentSeconds() {
    const d = getMumbaiLiveDate();
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  }

  function getActiveServiceDayMinutes() {
    return getServiceDayMinutes(getActiveCurrentMinutes());
  }

  function getActiveServiceDaySeconds() {
    return getServiceDaySeconds(getActiveCurrentSeconds());
  }

  function getTimeDifferenceMinutes(trainMinutes, currentMinutes) {
    const tMin = getServiceDayMinutes(trainMinutes);
    const cMin = getServiceDayMinutes(currentMinutes);
    return tMin - cMin;
  }

  function getTimeDifferenceSeconds(trainSeconds, currentSeconds) {
    const tSec = getServiceDaySeconds(trainSeconds);
    const cSec = getServiceDaySeconds(currentSeconds);
    return tSec - cSec;
  }

  function sortTrainsByServiceDay(trainsList) {
    if (!Array.isArray(trainsList)) return [];
    return [...trainsList].sort((a, b) => {
      const aTime = a.departureTime || a.fromStop?.departure_time || '00:00:00';
      const bTime = b.departureTime || b.fromStop?.departure_time || '00:00:00';
      return getServiceDayMinutes(aTime) - getServiceDayMinutes(bTime);
    });
  }

  function isTrainAc(t) {
    if (!t) return false;
    const type = (t.train?.train_type || '').toUpperCase();
    const name = (t.train?.train_name || '').toUpperCase();
    const num = String(t.train?.train_number || '');
    return type.includes('AC') || name.includes('AC') || num.startsWith('94');
  }

  function isTrainFast(t) {
    if (!t) return false;
    const type = (t.train?.train_type || '').toUpperCase();
    const name = (t.train?.train_name || '').toUpperCase();
    const code = (t.train?.train_code || '').toUpperCase();

    // 1. Explicit FAST identifiers in official train type and name
    if (type.includes('FAST') || name.includes('FAST') || type.includes('SF') || name.includes('SF')) {
      return true;
    }
    if (code.includes('F') || code.includes('KAN') || code.includes('SKP')) {
      return true;
    }

    // 2. Intelligent Stop Count Heuristics across all Mumbai suburban corridors:
    // If intermediate local stations are skipped, it is a FAST train!
    if (t.stopsCount && t.stopsCount > 0) {
      const orig = (t.originStation?.station_code || '').toUpperCase();
      const dest = (t.destinationStation?.station_code || '').toUpperCase();
      
      // Virar - Churchgate corridor (all-stops is 28-29; Fast is <= 18)
      if ((orig === 'VR' && dest === 'CCG') || (orig === 'CCG' && dest === 'VR')) {
        if (t.stopsCount <= 18) return true;
      }
      // Borivali - Churchgate corridor (all-stops is 21-22; Fast is <= 12)
      if ((orig === 'BVI' && dest === 'CCG') || (orig === 'CCG' && dest === 'BVI')) {
        if (t.stopsCount <= 12) return true;
      }
      // CSMT - Kalyan corridor (all-stops is 25-26; Fast is <= 14)
      if ((orig === 'CSMT' && dest === 'KYN') || (orig === 'KYN' && dest === 'CSMT')) {
        if (t.stopsCount <= 14) return true;
      }
      // CSMT - Kasara / Khopoli (Fast section between CSMT and Kalyan)
      if ((orig === 'CSMT' && (dest === 'KSRA' || dest === 'KHPI' || dest === 'KJT' || dest === 'ASO')) ||
          ((orig === 'KSRA' || orig === 'KHPI' || orig === 'KJT' || orig === 'ASO') && dest === 'CSMT')) {
        if (t.stopsCount <= 22) return true;
      }
      // CSMT - Thane corridor (all-stops is 18; Fast is <= 8)
      if ((orig === 'CSMT' && dest === 'TNA') || (orig === 'TNA' && dest === 'CSMT')) {
        if (t.stopsCount <= 8) return true;
      }
    }

    return false;
  }

  function findCurrentAndArrivedTrainIndex(trains) {
    if (!trains || trains.length === 0) return { arrivedIdx: -1, arrivingSoonIdx: -1, nextUpcomingIdx: -1, activeIdx: 0, scrollIdx: 0 };

    const currentServiceSec = getActiveServiceDaySeconds();

    let arrivedIdx = -1;
    let arrivingSoonIdx = -1;
    let nextUpcomingIdx = -1;
    let minPositiveDiff = Infinity;

    for (let i = 0; i < trains.length; i++) {
      const rawTime = trains[i].departureTime || trains[i].fromStop?.departure_time;
      const tSec = getServiceDaySeconds(rawTime);
      const delayMin = SmartDelayEngine.getTrainDelay(trains[i]);
      const effectiveSec = tSec + delayMin * 60;
      const diffSec = effectiveSec - currentServiceSec;

      // Exact match / arrival window (between -59s and 0s): Train is Arrived
      if (diffSec <= 0 && diffSec >= -59 && arrivedIdx === -1) {
        arrivedIdx = i;
      }
      // Under 15 minutes remaining before train arrives/departs (1s to 900s): Arriving soon
      if (diffSec > 0 && diffSec <= 900 && arrivingSoonIdx === -1) {
        arrivingSoonIdx = i;
      }
      // Next upcoming train
      if (diffSec >= 0 && diffSec < minPositiveDiff) {
        minPositiveDiff = diffSec;
        nextUpcomingIdx = i;
      }
    }

    let activeIdx = 0;
    if (arrivedIdx !== -1) {
      activeIdx = arrivedIdx;
    } else if (arrivingSoonIdx !== -1) {
      activeIdx = arrivingSoonIdx;
    } else if (nextUpcomingIdx !== -1) {
      activeIdx = nextUpcomingIdx;
    }

    return { arrivedIdx, arrivingSoonIdx, nextUpcomingIdx, activeIdx, scrollIdx: activeIdx };
  }

  // Real-time Train Delay Detection Logic (6-Layer Smart Architecture)
  function getTrainDelayMinutes(item, idx, hasArrivalAnimation) {
    if (!item) return 0;
    return SmartDelayEngine.getTrainDelay(item);
  }

  function getFilteredTrains() {
    if (currentTimetableFilter === 'FAST') {
      return currentTrainResults.filter(t => isTrainFast(t));
    } else if (currentTimetableFilter === 'SLOW') {
      return currentTrainResults.filter(t => !isTrainFast(t) && !isTrainAc(t));
    } else if (currentTimetableFilter === 'AC') {
      return currentTrainResults.filter(t => isTrainAc(t));
    }
    return currentTrainResults;
  }

  // Live Second-by-Second Countdown Updater for Timetable Tiles (No DOM Thrashing!)
  function updateTimetableArrivalTickers() {
    const resultsScreen = document.getElementById('screen-train-results');
    if (!resultsScreen || !resultsScreen.classList.contains('active')) return;

    const currentSec = getActiveServiceDaySeconds();
    const tiles = document.querySelectorAll('.train-timetable-tile');
    if (!tiles || tiles.length === 0) return;

    let needsFullRefresh = false;

    tiles.forEach(tile => {
      const pill = tile.querySelector('.arrival-pill-container');
      const idx = tile.getAttribute('data-train-idx');
      if (!pill) {
        // If this tile doesn't have an arrival pill yet, check if it just entered the <= 15 minute window!
        if (idx !== null && sortedCurrentTrains && sortedCurrentTrains[idx]) {
          const item = sortedCurrentTrains[idx];
          const rawTime = item.departureTime || item.fromStop?.departure_time;
          const tSec = getServiceDaySeconds(rawTime);
          const delayMin = SmartDelayEngine.getTrainDelay(item);
          const effectiveSec = tSec + delayMin * 60;
          const diffSec = effectiveSec - currentSec;
          if (diffSec > 0 && diffSec <= 900) {
            needsFullRefresh = true;
          }
        }
        return;
      }

      const depSecAttr = pill.getAttribute('data-dep-sec');
      if (!depSecAttr) return;
      const depSec = parseInt(depSecAttr, 10);
      const diffSec = depSec - currentSec;

      if (diffSec <= 0 && diffSec >= -59) {
        // Train arrived: show green dot and "Arrived", activate tile flash
        if (!pill.classList.contains('arrival-arrived')) {
          pill.className = 'arrival-pill-container arrival-arrived';
          pill.innerHTML = `
            <span class="arrival-pill-dot dot-green"></span>
            <span class="arrival-pill-text">Arrived</span>
          `;
          tile.classList.add('tile-arrived', 'tile-arrival-active');
          tile.classList.remove('tile-arriving');
        }
      } else if (diffSec > 0 && diffSec <= 900) {
        // Under 15 minutes: live countdown MM:SS (e.g. 15:00, 14:59...)
        if (!tile.classList.contains('tile-arriving')) {
          tile.classList.add('tile-arriving');
        }
        tile.classList.remove('tile-arrived', 'tile-arrival-active');
        const timeEl = pill.querySelector('.arrival-pill-time');
        if (timeEl) {
          const remM = Math.floor(diffSec / 60);
          const remS = diffSec % 60;
          timeEl.textContent = `${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
        }
      } else if (diffSec < -59) {
        // Arrived state finished, train has departed
        needsFullRefresh = true;
      }
    });

    if (needsFullRefresh) {
      renderTimetableTiles(getFilteredTrains(), false);
    }
  }

  // ==============================================================================
  // 6.2. TRAIN OPERATIONAL RUNNING STATUS ENGINE
  // Intelligently determines if a train is:
  // 1. SET FOR DEPARTURE: Berthed on PF within 15m of origin departure, or arriving/at PF
  // 2. CURRENTLY RUNNING: Departed origin, moving along the corridor before terminus
  // 3. NOT STARTED / NOT SCHEDULED - CURRENTLY EMPTY: More than 15m before origin departure
  // 4. DEPARTED: Train has already departed this station long ago
  // ==============================================================================
  function getTrainOperationalStatus(trainItem) {
    if (!trainItem) {
      return {
        isOperational: false,
        statusReason: 'NOT_SCHEDULED',
        displayText: 'Not Schedulled - Currently Empty'
      };
    }

    const rawTime = trainItem.departureTime || trainItem.fromStop?.departure_time || '05:45:00';
    const trainSeconds = parseTimeToSeconds(rawTime);
    const currentSeconds = getActiveCurrentSeconds();
    const currDepSec = getServiceDaySeconds(trainSeconds);
    const nowSec = getServiceDaySeconds(currentSeconds);

    // Start point (origin station) departure time
    let originDepSec = currDepSec;
    if (trainItem.originDepartureTime) {
      originDepSec = getServiceDaySeconds(parseTimeToSeconds(trainItem.originDepartureTime));
    } else if (trainItem.originStation && trainItem.fromStop && trainItem.originStation.id === trainItem.fromStop.station_id) {
      originDepSec = currDepSec;
    } else if (trainItem.fromStop?.sequence && trainItem.fromStop.sequence > 1) {
      // Average suburban inter-station travel ~2.5 mins (150s) per stop
      const stopsBefore = trainItem.fromStop.sequence - 1;
      originDepSec = Math.max(0, currDepSec - stopsBefore * 150);
    }

    // Destination arrival time
    let destArrSec = currDepSec + 45 * 60;
    if (trainItem.destinationArrivalTime) {
      destArrSec = getServiceDaySeconds(parseTimeToSeconds(trainItem.destinationArrivalTime));
    } else if (trainItem.arrivalTime) {
      destArrSec = getServiceDaySeconds(parseTimeToSeconds(trainItem.arrivalTime));
    }

    // Delay adjustment
    const delayMinutes = CrowdLiveEngine.getTrainDelay(trainItem);
    const delaySec = delayMinutes * 60;
    const originDepSecAdj = originDepSec + delaySec;
    const currDepSecAdj = currDepSec + delaySec;
    const destArrSecAdj = destArrSec + delaySec;

    // Time differences
    const diffOriginSec = originDepSecAdj - nowSec;   // > 0 if start departure is in future
    const diffCurrSec = currDepSecAdj - nowSec;       // > 0 if current station departure is in future
    const diffDestSec = destArrSecAdj - nowSec;       // > 0 if terminus arrival is in future

    // 1. Train has already departed this station long ago (more than 59 seconds in past)
    if (diffCurrSec < -59) {
      return {
        isOperational: false,
        statusReason: 'DEPARTED',
        displayText: 'Not Schedulled - Currently Empty'
      };
    }

    // 2. Set for Departure:
    // - At origin station or within 15 minutes of origin departure (train placed on PF, boarding active)
    // - Or within 15 minutes of departure from current station (arriving or arrived on PF)
    const isSetAtOrigin = (diffOriginSec <= 15 * 60 && diffOriginSec > 0);
    const isSetAtCurrentStation = (diffCurrSec <= 15 * 60 && diffCurrSec >= -59);

    if (isSetAtOrigin || isSetAtCurrentStation) {
      return {
        isOperational: true,
        statusReason: 'SET_FOR_DEPARTURE',
        displayText: ''
      };
    }

    // 3. Currently Running:
    // Train has departed its start point / origin (nowSec >= originDepSecAdj)
    // AND has not completed its terminus run (diffDestSec >= -300)
    // AND has not departed current station (diffCurrSec >= -59)
    if (nowSec >= originDepSecAdj && diffDestSec >= -300 && diffCurrSec >= -59) {
      return {
        isOperational: true,
        statusReason: 'CURRENTLY_RUNNING',
        displayText: ''
      };
    }

    // 4. Train has NOT started its schedule from its start point departure place:
    // (diffOriginSec > 15 * 60)
    return {
      isOperational: false,
      statusReason: 'NOT_STARTED',
      displayText: 'Not Schedulled - Currently Empty'
    };
  }

  function renderSingleTrainTileHtml(item, idx, currentMinutes) {
    const isFast = isTrainFast(item);
    const isAc = isTrainAc(item);
    const isSlow = !isFast;

    // 1. Departure Time (Strict 12-hour AM/PM type: e.g. 03:40 AM)
    const rawTime = item.departureTime || item.fromStop?.departure_time || '05:45:00';
    const { hhmm, ampm } = formatTime12(rawTime);
    const trainSeconds = parseTimeToSeconds(rawTime);
    const currentSeconds = getActiveCurrentSeconds();
    const trainServiceSec = getServiceDaySeconds(trainSeconds);

    // 6-Layer Real-time Delay & Estimated Reach Time Detection
    const delayResult = SmartDelayEngine.getTrainDelayResult(item);
    const delayMinutes = delayResult.delayMinutes;
    const hasDelay = delayMinutes > 0;
    const effectiveDepSec = trainServiceSec + delayMinutes * 60;
    const diffSec = effectiveDepSec - getServiceDaySeconds(currentSeconds);

    // Arrival Status:
    // 1. Frameless: without frame, only Dot + MM:SS time or Dot + Arrived
    // 2. Under 15 minutes: only Dot and remaining arrival time in format "15:00" (diffSec <= 900 && > 0)
    // 3. Reached station: diffSec <= 0 && diffSec >= -59 -> flashes & green dot "Arrived"
    const isArrived = (diffSec <= 0 && diffSec >= -59) || (diffSec <= 0 && Math.floor(diffSec / 60) === 0);
    const isArriving = (diffSec > 0 && diffSec <= 900);
    const isPast = (diffSec < -59);

    // 2. Destination / Speed label
    let destName = item.destinationStation?.station_name || 'Churchgate';
    destName = destName.replace(' Road', '').replace(' Suburban', '');
    const hasDot = !isArrived && !isArriving && (destName.toLowerCase() === 'nalasopara' || destName.toLowerCase() === 'andheri');

    // Arrival Notification (Frameless: only Dot and time in MM:SS under 15m, or Dot and Arrived when arrived)
    let arrivalBadgeHtml = '';
    if (isArrived) {
      arrivalBadgeHtml = `
        <div class="arrival-pill-container arrival-arrived" data-dep-sec="${effectiveDepSec}">
          <span class="arrival-pill-dot dot-green"></span>
          <span class="arrival-pill-text">Arrived</span>
        </div>
      `;
    } else if (isArriving) {
      const remM = Math.floor(diffSec / 60);
      const remS = diffSec % 60;
      const mmss = `${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
      arrivalBadgeHtml = `
        <div class="arrival-pill-container arrival-arriving" data-dep-sec="${effectiveDepSec}">
          <span class="arrival-pill-dot dot-yellow"></span>
          <span class="arrival-pill-text arrival-pill-time">${mmss}</span>
        </div>
      `;
    }

    // 3. Route String (Bottom-Left, e.g. Virar - Churchgate)
    let originName = item.originStation?.station_name || 'Churchgate';
    let termName = item.destinationStation?.station_name || 'Virar';
    originName = originName.replace(' Road', '').replace(' Suburban', '');
    termName = termName.replace(' Road', '').replace(' Suburban', '');
    const routeStr = `${originName} - ${termName}`;

    // 4. Platform (Top-Right in Design Version 2, replacing old Time spot)
    let pf = item.fromStop?.platform;
    if (!pf) {
      const fromName = (selectedFromStation?.name || '').toLowerCase();
      const num = parseInt(item.train?.train_number || '0', 10);
      if (fromName.includes('virar')) {
        if (destName.toLowerCase().includes('andheri')) pf = '01';
        else if (isFast) pf = (num % 2 === 0) ? '03' : '02';
        else pf = '02';
      } else if (fromName.includes('dadar')) {
        pf = isFast ? '04' : '03';
      } else if (fromName.includes('churchgate')) {
        pf = isFast ? '03' : '02';
      } else if (fromName.includes('borivali')) {
        pf = isFast ? '05' : '03';
      } else if (fromName.includes('csmt')) {
        pf = isFast ? '05' : '04';
      } else {
        pf = '03';
      }
    }
    const pfStr = `PF: ${String(pf).padStart(2, '0')}`;

    // 5. Real-time Delay Detection & Estimated Reach Time Display
    let delayText = '';
    if (hasDelay) {
      const eta12 = formatTime12(delayResult.estimatedReachTime);
      delayText = `Late by ${delayMinutes}m • Exp ${eta12.hhmm} ${eta12.ampm}`;
    }
    const speedColorClass = isFast ? 'color-fast' : 'color-slow';

    let arrivalClass = '';
    if (isArrived) {
      arrivalClass = 'tile-arrived tile-arrival-active';
    } else if (isArriving) {
      arrivalClass = 'tile-arriving';
    }

    // 6. Dynamic Crowd Strength Calculation & Operational Status
    const opStatus = getTrainOperationalStatus(item);
    const crowdEst = CrowdStrengthManager.getEstimate(item);

    // Layout:
    // Row 1: [Time (07:17 PM) + Station Name (Churchgate)]             [Platform (PF: 03)]
    // Row 2: [Route (Virar - Churchgate)]                               [Below PF: Arrival pill / Delay]
    // Row 3 (Extends on Long-Press): 
    //   - If Running / Set for Departure: [Crowd] [===----] [25% / 100%+]
    //   - If Not started schedule / Empty: [⚪ Not Schedulled - Currently Empty]
    return `
      <div class="train-timetable-tile ${isAc ? 'tile-ac' : ''} ${arrivalClass} ${hasDelay ? 'tile-has-delay' : ''} ${isPast ? 'tile-past-schedule' : ''}" data-train-idx="${idx}" id="train-tile-${idx}">
        <div class="tile-top-row">
          <div class="tile-dest-box">
            <div class="tile-time-box">
              <span class="tile-time-val">${hhmm}</span>
              <span class="tile-time-ampm">${ampm}</span>
            </div>
            <span class="tile-dest-text ${speedColorClass}">${destName}</span>
            ${hasDot ? '<span class="tile-dot">•</span>' : ''}
            ${isAc ? '<span class="tile-ac-badge">AC</span>' : ''}
          </div>
          <span class="tile-platform-text">${pfStr}</span>
        </div>
        <div class="tile-bottom-row">
          <span class="tile-route-text">${routeStr}</span>
          <div class="tile-below-pf">
            ${arrivalBadgeHtml}
            ${hasDelay ? `<span class="tile-delay-text">${delayText}</span>` : ''}
          </div>
        </div>
        <div class="tile-crowd-drawer" id="tile-crowd-drawer-${idx}">
          <div class="tile-crowd-row" ${!opStatus.isOperational ? 'style="display: none;"' : ''}>
            <span class="tile-crowd-label" style="color: ${crowdEst.color};">Crowd</span>
            <div class="tile-crowd-track">
              <div class="tile-crowd-fill ${crowdEst.visualPercentage >= 100 ? 'fill-extreme' : ''}" 
                   style="width: 0%; background-color: ${crowdEst.color};" 
                   data-target-pct="${crowdEst.visualPercentage}"></div>
            </div>
            <span class="tile-crowd-pct" style="color: ${crowdEst.color};">${crowdEst.displayPercentage}</span>
          </div>
          <div class="tile-crowd-empty-row" ${opStatus.isOperational ? 'style="display: none;"' : ''}>
            <span class="tile-crowd-empty-badge">
              <span class="tile-crowd-empty-dot"></span>
              Not Schedulled - Currently Empty
            </span>
          </div>
        </div>
      </div>
    `;
  }

  function renderTimetableTiles(trains, shouldAutoScroll = true) {
    const container = document.getElementById('timetableTilesContainer');
    if (!container) return;

    // Reset filter bar to default SHOWN state
    const filterBar = document.getElementById('timetableFilterBar');
    if (filterBar) {
      filterBar.classList.remove('is-scrolled-hidden');
    }

    if (!trains || trains.length === 0) {
      container.innerHTML = `
        <div class="timetable-empty-box">
          <div class="timetable-empty-icon">🚆</div>
          <div class="timetable-empty-title">No trains found</div>
          <div class="timetable-empty-desc">No trains match the selected filter on this corridor.</div>
        </div>
      `;
      return;
    }

    // 1. Always sort trains in Suburban Service Day sequence (03:30 AM through late night 02:30 AM)
    const sortedTrains = sortTrainsByServiceDay(trains);
    SmartDelayEngine.applyCorridorDomino(sortedTrains);
    sortedCurrentTrains = sortedTrains;

    const currentMinutes = getActiveCurrentMinutes();
    const currentServiceMin = getActiveServiceDayMinutes();
    const { arrivedIdx, arrivingSoonIdx, nextUpcomingIdx, activeIdx } = findCurrentAndArrivedTrainIndex(sortedTrains);

    const firstTrain = sortedTrains[0];
    const lastTrain = sortedTrains[sortedTrains.length - 1];
    const firstTrainTime = formatTime12(firstTrain.departureTime || firstTrain.fromStop?.departure_time);
    const lastTrainTime = formatTime12(lastTrain.departureTime || lastTrain.fromStop?.departure_time);
    const lastTrainServiceMin = getServiceDayMinutes(lastTrain.departureTime || lastTrain.fromStop?.departure_time);

    let lastDest = lastTrain.destinationStation?.station_name || 'Borivali';
    lastDest = lastDest.replace(' Road', '').replace(' Suburban', '');
    let firstDest = firstTrain.destinationStation?.station_name || 'Virar';
    firstDest = firstDest.replace(' Road', '').replace(' Suburban', '');

    // Night hiatus check: current time is after the last night train has departed and before 03:30 AM morning
    const isServiceConcludedForNight = (currentServiceMin > lastTrainServiceMin);

    let html = '';

    if (isServiceConcludedForNight) {
      // NIGHT HIATUS GAP (e.g. 01:30 AM - 03:30 AM):
      // Show late-night concluded trains followed by "Last train of the day" card
      const nightTiles = sortedTrains.slice(-2).map((item, idx) => 
        renderSingleTrainTileHtml(item, sortedTrains.length - 2 + idx, currentMinutes)
      ).join('');

      html += nightTiles;
      html += `
        <div class="timetable-end-of-day-card" id="endOfDayCard">
          <div class="end-of-day-badge">
            <span class="end-of-day-moon">🌙</span>
            <span class="end-of-day-text">Last train of the day: <strong>${lastDest} • ${lastTrainTime.hhmm} ${lastTrainTime.ampm}</strong></span>
          </div>
          <p class="end-of-day-note">Regular local train services conclude here for tonight. Services resume in the early morning.</p>
          <button id="btnShowMorningTrains" class="btn-show-morning-trains" title="Show morning schedules starting from ${firstDest} ${firstTrainTime.hhmm} ${firstTrainTime.ampm}">
            <span class="morning-btn-icon">🌅</span>
            <span class="morning-btn-text">Show Morning train</span>
            <span class="morning-btn-badge">from ${firstTrainTime.hhmm} ${firstTrainTime.ampm}</span>
            <svg class="morning-btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      `;
    } else {
      // ACTIVE SERVICE HOURS (Morning, Daytime, Evening, Night):
      // Render full day schedule list directly, and auto-scroll user to the current arrived train
      html += sortedTrains.map((item, idx) => 
        renderSingleTrainTileHtml(item, idx, currentMinutes)
      ).join('');

      // Show end of day card at the bottom of the full day's timetable
      html += `
        <div class="timetable-end-of-day-card" id="endOfDayCard">
          <div class="end-of-day-badge">
            <span class="end-of-day-moon">🌙</span>
            <span class="end-of-day-text">Last train of the day: <strong>${lastDest} • ${lastTrainTime.hhmm} ${lastTrainTime.ampm}</strong></span>
          </div>
          <p class="end-of-day-note">Regular local train services conclude here for tonight. Services resume in the early morning.</p>
        </div>
      `;
    }

    container.innerHTML = html;

    // Attach click listener for "Show Morning train" (in night hiatus mode)
    container.querySelector('#btnShowMorningTrains')?.addEventListener('click', () => {
      const allTiles = sortedTrains.map((item, idx) => 
        renderSingleTrainTileHtml(item, idx, currentMinutes)
      ).join('');
      container.innerHTML = allTiles;
      container.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Long-Press (5s) to reveal Crowd Strength + Single Click to open Train Journey
    container.querySelectorAll('.train-timetable-tile').forEach(tile => {
      let holdTimer = null;
      let isLongPressCompleted = false;
      let startX = 0;
      let startY = 0;
      const idx = parseInt(tile.getAttribute('data-train-idx'), 10);
      const t = sortedTrains[idx];

      const cancelHold = () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        tile.classList.remove('is-holding');
      };

      tile.addEventListener('pointerdown', (e) => {
        // Only primary mouse button or touch
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        startX = e.clientX;
        startY = e.clientY;
        isLongPressCompleted = false;
        tile.classList.add('is-holding');

        // Preload fresh estimate in background only if operational
        if (t && getTrainOperationalStatus(t).isOperational) {
          CrowdStrengthManager.getEstimate(t, (serverEst) => {
            if (tile.classList.contains('crowd-expanded')) {
              CrowdStrengthManager.applyEstimateToTile(tile, serverEst);
            }
          });
        }

        // Long press of 1 second (1000ms)
        holdTimer = setTimeout(() => {
          isLongPressCompleted = true;
          cancelHold();
          if (t) {
            CrowdStrengthManager.expandTile(tile, t);
          }
        }, 1000);
      });

      tile.addEventListener('pointermove', (e) => {
        if (!holdTimer) return;
        // Cancel long press if moved more than 10px (user is scrolling)
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist > 10) {
          cancelHold();
        }
      });

      tile.addEventListener('pointerup', (e) => {
        cancelHold();
        if (isLongPressCompleted) {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => { isLongPressCompleted = false; }, 350);
          return;
        }
      });

      tile.addEventListener('pointercancel', cancelHold);
      tile.addEventListener('pointerleave', cancelHold);

      // Single Click Handler: opens train journey screen (works both when closed and when open for crowd!)
      tile.addEventListener('click', (e) => {
        if (isLongPressCompleted) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (t) {
          openTrainJourneyScreen(t, idx);
        }
      });

      // Accessibility fallback: Contextmenu (Right click on desktop) or double-click to preview crowd
      tile.addEventListener('contextmenu', (e) => {
        if (t) {
          e.preventDefault();
          CrowdStrengthManager.expandTile(tile, t);
        }
      });
    });


    syncScrollIndicator(container);

    // Smart Auto-Scroll: takes user directly to where the current train has arrived
    if (shouldAutoScroll) {
      const scrollToActive = () => {
        const targetTile = container.querySelector('.tile-arrived') || 
                           container.querySelector('.tile-arriving') || 
                           container.querySelector(`[data-train-idx="${activeIdx}"]`);
        if (targetTile && container) {
          const targetTop = targetTile.offsetTop;
          container.scrollTo({
            top: Math.max(0, targetTop - 92),
            behavior: 'smooth'
          });
        }
      };
      requestAnimationFrame(() => {
        scrollToActive();
        setTimeout(scrollToActive, 100);
      });
    }
  }

  function applyTimetableFilter(filterType) {
    currentTimetableFilter = filterType;
    document.querySelectorAll('.timetable-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filterType);
    });
    renderTimetableTiles(getFilteredTrains(), true);
  }

  // Filter button click listeners
  document.querySelectorAll('.timetable-filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.getAttribute('data-filter');
      applyTimetableFilter(f);
    });
  });

  // Development time controls to test arrival states
  document.getElementById('btnJumpNextTrain')?.addEventListener('click', () => {
    const trains = getFilteredTrains();
    if (!trains || trains.length === 0) return;
    const now = new Date();
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const realMumbaiNow = new Date(istString);
    const realMin = realMumbaiNow.getHours() * 60 + realMumbaiNow.getMinutes();

    let targetTrain = trains.find(t => {
      const tMin = parseTimeToMinutes(t.departureTime || t.fromStop?.departure_time);
      return getTimeDifferenceMinutes(tMin, realMin) > 0;
    }) || trains[0];

    const trainMin = parseTimeToMinutes(targetTrain.departureTime || targetTrain.fromStop?.departure_time);
    // Set simulated time to exactly 1 minute before this train!
    let diffMin = (trainMin - 1) - realMin;
    while (diffMin < -720) diffMin += 1440;
    while (diffMin > 720) diffMin -= 1440;
    simulatedMinutesOffset = diffMin;

    updateLiveClockBanner();
    renderTimetableTiles(trains, true);
    if (document.getElementById('screen-train-journey')?.classList.contains('active')) {
      refreshJourneyCurrentStop(true);
    }
    const dest = targetTrain.destinationStation?.station_name || 'Train';
    const rawT = targetTrain.departureTime || targetTrain.fromStop?.departure_time;
    const fT = formatTime12(rawT);
    showToast(`⏱️ Set to 1m before ${dest} (${fT.hhmm} ${fT.ampm}) → Arriving!`);
  });

  document.getElementById('btnNextMinute')?.addEventListener('click', () => {
    if (simulatedMinutesOffset === null) simulatedMinutesOffset = 0;
    simulatedMinutesOffset += 1;
    updateLiveClockBanner();
    renderTimetableTiles(getFilteredTrains(), false);
    if (document.getElementById('screen-train-journey')?.classList.contains('active')) {
      refreshJourneyCurrentStop(true);
    }
  });

  document.getElementById('btnPrevMinute')?.addEventListener('click', () => {
    if (simulatedMinutesOffset === null) simulatedMinutesOffset = 0;
    simulatedMinutesOffset -= 1;
    updateLiveClockBanner();
    renderTimetableTiles(getFilteredTrains(), false);
    if (document.getElementById('screen-train-journey')?.classList.contains('active')) {
      refreshJourneyCurrentStop(true);
    }
  });

  document.getElementById('btnResetLiveTime')?.addEventListener('click', () => {
    simulatedMinutesOffset = null;
    updateLiveClockBanner();
    renderTimetableTiles(getFilteredTrains(), true);
    if (document.getElementById('screen-train-journey')?.classList.contains('active')) {
      refreshJourneyCurrentStop(true);
    }
    showToast('🕒 Restored live Mumbai device time');
  });

  // Back from Results Screen
  document.getElementById('btnBackFromResults')?.addEventListener('click', () => {
    showScreen('screen-home');
    checkShowResultsButton();
  });

  // Marquee handler for long route titles (e.g. Churchgate → Borivali / Virar / Dahanu)
  function updateRouteMarquee() {
    const wrapper = document.getElementById('resultsRouteWrapper');
    const titleEl = document.getElementById('resultsRouteTitle');
    if (!wrapper || !titleEl) return;

    wrapper.classList.remove('has-overflow');
    titleEl.style.removeProperty('--marquee-dist');
    titleEl.style.removeProperty('--marquee-duration');

    const containerWidth = wrapper.clientWidth;
    const contentWidth = titleEl.scrollWidth;

    if (contentWidth > containerWidth + 6) {
      const overflowDistance = contentWidth - containerWidth + 18;
      const duration = Math.max(6.5, (overflowDistance / 28) + 3.5);
      titleEl.style.setProperty('--marquee-dist', `${overflowDistance}px`);
      titleEl.style.setProperty('--marquee-duration', `${duration.toFixed(1)}s`);
      wrapper.classList.add('has-overflow');
    } else {
      wrapper.classList.remove('has-overflow');
    }
  }

  window.addEventListener('resize', updateRouteMarquee);

  // Favorite Star toggle
  const btnResultsFav = document.getElementById('btnResultsFav');
  btnResultsFav?.addEventListener('click', () => {
    btnResultsFav.classList.toggle('active');
    const isFav = btnResultsFav.classList.contains('active');
    showToast(isFav ? '⭐ Route added to Favorites!' : 'Route removed from Favorites');
  });

  // Small Refresh Button next to Star: Jump to Currently Arrived Train
  const btnScrollToArrived = document.getElementById('btnScrollToArrived');
  btnScrollToArrived?.addEventListener('click', () => {
    btnScrollToArrived.classList.add('spinning');
    setTimeout(() => btnScrollToArrived.classList.remove('spinning'), 600);

    const container = document.getElementById('timetableTilesContainer');
    if (!container) return;

    renderTimetableTiles(getFilteredTrains(), true);
    showToast('🚆 Centered on live arrived train');
  });

  // Master Search Trains Handler
  async function searchTrains() {
    // If selectedFromStation or selectedToStation are missing, resolve them from inputs
    if (!selectedFromStation && fromInput?.value?.trim()) {
      selectedFromStation = resolveStationFromInput(fromInput.value.trim()) || {
        id: 'stn_custom_from',
        name: fromInput.value.trim()
      };
    }
    if (!selectedToStation && toInput?.value?.trim()) {
      selectedToStation = resolveStationFromInput(toInput.value.trim()) || {
        id: 'stn_custom_to',
        name: toInput.value.trim()
      };
    }

    if (!selectedFromStation || !selectedToStation) return;

    // Update Results Screen Header
    const fromEl = document.getElementById('resFromStation');
    const toEl = document.getElementById('resToStation');
    if (fromEl) fromEl.textContent = selectedFromStation.name;
    if (toEl) toEl.textContent = selectedToStation.name;

    // Switch to dedicated Screen 5 immediately
    showScreen('screen-train-results');

    // Trigger route marquee recalculation on next layout frame
    requestAnimationFrame(() => {
      setTimeout(updateRouteMarquee, 60);
    });

    const container = document.getElementById('timetableTilesContainer');
    if (container) {
      container.innerHTML = `
        <div class="timetable-empty-box">
          <div class="timetable-empty-icon">⏳</div>
          <div class="timetable-empty-title">Loading Timetable...</div>
          <div class="timetable-empty-desc">Searching official Mumbai Suburban schedules</div>
        </div>
      `;
    }

    // Reset filter to ALL
    currentTimetableFilter = 'ALL';
    document.querySelectorAll('.timetable-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === 'ALL');
    });

    try {
      let url = `/api/trains?from=${selectedFromStation.id}`;
      if (selectedDirectionFilter && selectedDirectionFilter.direction) {
        url += `&direction=${selectedDirectionFilter.direction}`;
        if (selectedDirectionFilter.lineId) url += `&lineId=${selectedDirectionFilter.lineId}`;
        if (selectedDirectionFilter.corridor) url += `&corridor=${selectedDirectionFilter.corridor}`;
      } else if (selectedToStation) {
        url += `&to=${selectedToStation.id}`;
      }

      const res = await fetch(url);
      const trains = await res.json();

      currentTrainResults = Array.isArray(trains) ? trains : [];

      // If direct trains are 0, automatically find and open the Connecting "VIA" Route!
      if (currentTrainResults.length === 0 && selectedToStation && !selectedDirectionFilter) {
        const viaSuccess = await tryOpenViaConnectingRoute(selectedFromStation, selectedToStation);
        if (viaSuccess) return;
      }

      renderTimetableTiles(currentTrainResults);
    } catch (err) {
      console.error('Error fetching trains:', err);
      if (container) {
        container.innerHTML = `
          <div class="timetable-empty-box">
            <div class="timetable-empty-icon">⚠️</div>
            <div class="timetable-empty-title">Failed to load schedules</div>
            <div class="timetable-empty-desc">Please check network connection and try again.</div>
          </div>
        `;
      }
    }
  }

  // ==============================================================================
  // 6.4. "VIA" INTERCHANGE CONNECTING ROUTE PLANNER (SCREEN 7)
  // - Top-to-Bottom Vertical Timeline Journey Planner
  // - Finds connecting route when direct train is unavailable
  // ==============================================================================

  const MUMBAI_INTERCHANGE_HUBS = [
    { 
      id: 'stn_dr', 
      name: 'Dadar', 
      code: 'DR', 
      zone: 'WR / CR', 
      walkMin: 4, 
      fromLineShort: 'WR',
      toLineShort: 'CR',
      walkDesc: 'De-board train at Western Line Platform, walk over Middle Foot Overbridge (FOB) towards Central Railway side.',
      platDesc: 'Head to Platform 3, 4 or 5 for Central Line Down trains heading towards Thane / Kalyan / Karjat.'
    },
    { 
      id: 'stn_cla', 
      name: 'Kurla', 
      code: 'CLA', 
      zone: 'CR / HR', 
      walkMin: 3, 
      fromLineShort: 'CR',
      toLineShort: 'HR',
      walkDesc: 'Walk over FOB connecting Central Railway Main line platforms (1-4) and Harbour Line platforms (7-8).',
      platDesc: 'Head to Platform 7 or 8 for Harbour line trains heading towards Vashi / Panvel / Chembur.'
    },
    { 
      id: 'stn_tna', 
      name: 'Thane', 
      code: 'TNA', 
      zone: 'CR / TH', 
      walkMin: 3, 
      fromLineShort: 'CR',
      toLineShort: 'TH',
      walkDesc: 'Walk over Main FOB between Central Railway Main line platforms (1-6) and Trans-Harbour Line platforms (9-10).',
      platDesc: 'Head to Platform 9 or 10 for Trans-Harbour line trains heading towards Vashi / Panvel / Nerul.'
    },
    { 
      id: 'stn_vdlr', 
      name: 'Vadala Road', 
      code: 'VDLR', 
      zone: 'HR', 
      walkMin: 2, 
      fromLineShort: 'HR',
      toLineShort: 'HR',
      walkDesc: 'Cross platform at Vadala Road between CSMT-Panvel mainline and Andheri-Goregaon branch.',
      platDesc: 'Platform 1 or 2 for connecting Harbour branch trains.'
    },
    { 
      id: 'stn_adh', 
      name: 'Andheri', 
      code: 'ADH', 
      zone: 'WR / HR', 
      walkMin: 3, 
      fromLineShort: 'WR',
      toLineShort: 'HR',
      walkDesc: 'Interchange between Western Railway main tracks and Harbour line platforms.',
      platDesc: 'Head to Harbour Line Platform 6 or 7 for connecting trains.'
    },
    { 
      id: 'stn_ba', 
      name: 'Bandra', 
      code: 'BA', 
      zone: 'WR / HR', 
      walkMin: 3, 
      fromLineShort: 'WR',
      toLineShort: 'HR',
      walkDesc: 'Interchange between Western Railway and Harbour line platforms.',
      platDesc: 'Platform 1 or 2 for Harbour line trains.'
    },
    { 
      id: 'stn_vsh', 
      name: 'Vashi', 
      code: 'VSH', 
      zone: 'HR / TH', 
      walkMin: 2, 
      fromLineShort: 'HR',
      toLineShort: 'TH',
      walkDesc: 'Interchange between Harbour line (CSMT-Panvel) and Trans-Harbour line (Thane-Vashi).',
      platDesc: 'Platform 3 or 4 for connecting Trans-Harbour trains.'
    },
    { 
      id: 'stn_kyn', 
      name: 'Kalyan', 
      code: 'KYN', 
      zone: 'CR', 
      walkMin: 3, 
      fromLineShort: 'CR',
      toLineShort: 'CR',
      walkDesc: 'Junction connecting Central Main line with Kasara (NE) and Karjat/Khopoli (SE) lines.',
      platDesc: 'Platform 4, 5, 6 or 7 for connecting branch trains.'
    }
  ];

  let currentViaOptions = [];
  let currentActiveViaHubId = null;

  async function findViaConnectingHubs(fromStationId, toStationId) {
    if (!fromStationId || !toStationId || fromStationId === toStationId) return [];
    const validHubs = [];

    for (const hub of MUMBAI_INTERCHANGE_HUBS) {
      if (hub.id === fromStationId || hub.id === toStationId) continue;
      try {
        const [leg1Res, leg2Res] = await Promise.all([
          fetch(`/api/trains?from=${fromStationId}&to=${hub.id}`),
          fetch(`/api/trains?from=${hub.id}&to=${toStationId}`)
        ]);
        const leg1Trains = await leg1Res.json();
        const leg2Trains = await leg2Res.json();

        if (Array.isArray(leg1Trains) && leg1Trains.length > 0 && Array.isArray(leg2Trains) && leg2Trains.length > 0) {
          validHubs.push({
            hub,
            leg1Trains,
            leg2Trains,
            totalFrequency: leg1Trains.length + leg2Trains.length
          });
        }
      } catch (e) {
        console.warn('Via check error for hub', hub.id, e);
      }
    }

    // Sort hubs: Dadar prioritized for WR-CR, Kurla for CR-HR, Thane for CR-TH, then total frequency
    validHubs.sort((a, b) => {
      if (a.hub.id === 'stn_dr') return -1;
      if (b.hub.id === 'stn_dr') return 1;
      return b.totalFrequency - a.totalFrequency;
    });

    return validHubs;
  }

  async function tryOpenViaConnectingRoute(fromStn, toStn) {
    if (!fromStn || !toStn) return false;
    const hubs = await findViaConnectingHubs(fromStn.id, toStn.id);
    if (hubs && hubs.length > 0) {
      showToast(`🔄 No direct train between ${fromStn.name} and ${toStn.name}. Opening Connecting Route via ${hubs[0].hub.name}...`, 3500);
      currentViaOptions = hubs;
      renderViaRouteScreen(fromStn, toStn, hubs[0].hub.id, hubs);
      return true;
    }
    return false;
  }

  function getStationZoneOrLine(stationObj) {
    if (!stationObj) return 'Suburban Line';
    const stn = (allStations && allStations.find(s => s.id === stationObj.id)) || stationObj;
    if (stn.zone === 'WR') return 'WR • Western Line';
    if (stn.zone === 'CR') return 'CR • Central Line';
    if (stn.zone === 'HR' || stn.zone === 'TR' || stn.zone === 'BN') return 'HR • Harbour Line';
    const code = (stn.station_code || '').toUpperCase();
    const id = stn.id || '';
    const wrCodes = ['CCG', 'MEL', 'CYR', 'GTR', 'MMCT', 'MX', 'PL', 'PBHD', 'MRU', 'MM', 'BA', 'KHAR', 'STC', 'VLP', 'ADH', 'JOS', 'RMAR', 'GMN', 'MDD', 'KILE', 'DIC', 'BVI', 'BYR', 'NIG', 'BSR', 'NSP', 'VR', 'SAH', 'PLG', 'BOR', 'DRD'];
    if (wrCodes.includes(code) || id.startsWith('stn_wr_')) return 'WR • Western Line';
    const hrCodes = ['VDLR', 'GTBN', 'CHF', 'CLA', 'TKNG', 'CMBR', 'GV', 'MNKD', 'VSH', 'SNCR', 'JNJ', 'NEU', 'SWDV', 'BEPR', 'KHAG', 'MANR', 'KNDS', 'PNVL'];
    if (hrCodes.includes(code)) return 'HR • Harbour Line';
    return 'CR • Central Line';
  }

  function renderViaRouteScreen(fromStn, toStn, preferredHubId = null, preloadedHubs = null) {
    const hubsList = preloadedHubs || currentViaOptions;
    const viaOption = (hubsList && hubsList.length > 0) 
      ? (hubsList.find(h => h.hub.id === preferredHubId) || hubsList[0])
      : null;

    const hub = viaOption ? viaOption.hub : (MUMBAI_INTERCHANGE_HUBS.find(h => h.id === preferredHubId) || MUMBAI_INTERCHANGE_HUBS[0]);
    currentActiveViaHubId = hub.id;

    // Header Top Bar
    const fromEl = document.getElementById('viaFromText');
    const hubEl = document.getElementById('viaHubText');
    const toEl = document.getElementById('viaToText');
    if (fromEl) fromEl.textContent = fromStn.name;
    if (hubEl) hubEl.textContent = `VIA ${hub.name}`;
    if (toEl) toEl.textContent = toStn.name;

    const badgeText = document.getElementById('viaRouteBadgeText');
    if (badgeText) badgeText.textContent = `Connecting Route (Via ${hub.name})`;

    // Sample train durations
    const sampleTrain1 = viaOption?.leg1Trains[0];
    const sampleTrain2 = viaOption?.leg2Trains[0];
    
    const leg1Min = sampleTrain1 ? (sampleTrain1.durationMinutes || 18) : 18;
    const leg2Min = sampleTrain2 ? (sampleTrain2.durationMinutes || 30) : 30;
    const totalMin = leg1Min + hub.walkMin + leg2Min;

    const metricTime = document.getElementById('viaMetricTime');
    if (metricTime) metricTime.textContent = `~${totalMin} min`;

    const metricTransfer = document.getElementById('viaMetricTransfer');
    if (metricTransfer) metricTransfer.textContent = `1 Transfer (${hub.name})`;

    const metricDist = document.getElementById('viaMetricDist');
    if (metricDist) metricDist.textContent = `~${Math.round(totalMin * 0.85)} km`;

    const metricFare = document.getElementById('viaMetricFare');
    if (metricFare) metricFare.textContent = '₹15 II / ₹105 I';

    // Hubs Switcher (Pill tabs)
    const switcher = document.getElementById('viaHubsSwitcher');
    if (switcher) {
      if (hubsList && hubsList.length > 1) {
        switcher.style.display = 'flex';
        switcher.innerHTML = hubsList.map(h => {
          const isAct = h.hub.id === hub.id;
          const isRec = h.hub.id === hubsList[0].hub.id;
          return `
            <button class="via-hub-tab ${isAct ? 'active' : ''}" data-hub-id="${h.hub.id}">
              ${isRec ? '★ ' : ''}Via ${h.hub.name} (${h.leg1Trains.length + h.leg2Trains.length} trains)
            </button>
          `;
        }).join('');

        switcher.querySelectorAll('.via-hub-tab').forEach(tabBtn => {
          tabBtn.addEventListener('click', () => {
            const hId = tabBtn.getAttribute('data-hub-id');
            renderViaRouteScreen(fromStn, toStn, hId, hubsList);
          });
        });
      } else {
        switcher.style.display = 'none';
      }
    }

    // STEP 1: ORIGIN
    const startName = document.getElementById('viaStartStationName');
    if (startName) startName.textContent = fromStn.name;

    const startLinePill = document.getElementById('viaStartLinePill');
    const fromLineZone = getStationZoneOrLine(fromStn);
    if (startLinePill) startLinePill.textContent = fromLineZone;

    const startPlatCue = document.getElementById('viaStartPlatformCue');
    if (startPlatCue) startPlatCue.textContent = `Platform 1 / 2 • Towards ${hub.name} / ${toStn.name}`;

    // Upcoming departures from Origin (Leg 1)
    const startUpcomingPills = document.getElementById('viaStartUpcomingPills');
    if (startUpcomingPills) {
      const top4 = viaOption?.leg1Trains ? viaOption.leg1Trains.slice(0, 4) : [];
      if (top4.length > 0) {
        startUpcomingPills.innerHTML = top4.map(t => {
          const rawT = t.departureTime || t.fromStop?.departure_time || '09:00';
          const formatted = formatTime12(rawT);
          const isFast = isTrainFast(t);
          return `
            <span class="vu-chip ${isFast ? 'fast' : ''}">
              ${formatted.hhmm} ${formatted.ampm} ${isFast ? '⚡ Fast' : 'Slow'}
            </span>
          `;
        }).join('');
      } else {
        startUpcomingPills.innerHTML = `<span class="vu-chip">Departures every 3-5 mins</span>`;
      }
    }

    // LEG 1 TRANSIT
    const leg1Title = document.getElementById('viaLeg1Title');
    if (leg1Title) leg1Title.textContent = `${fromLineZone.split('•')[1]?.trim() || 'Suburban'} Local`;

    const leg1Duration = document.getElementById('viaLeg1Duration');
    if (leg1Duration) leg1Duration.textContent = `~${leg1Min} min`;

    const leg1Desc = document.getElementById('viaLeg1Desc');
    const leg1StopsCount = sampleTrain1 ? (sampleTrain1.stopsCount || 7) : 7;
    if (leg1Desc) leg1Desc.textContent = `Ride ${leg1StopsCount} stops from ${fromStn.name} to ${hub.name}`;

    // Intermediate stops expander for Leg 1
    const toggleLeg1Btn = document.getElementById('btnToggleLeg1Stops');
    const leg1StopsList = document.getElementById('viaLeg1StopsList');
    if (toggleLeg1Btn) {
      const btnSpan = toggleLeg1Btn.querySelector('span');
      if (btnSpan) btnSpan.textContent = `View ${leg1StopsCount} Stops`;
      if (leg1StopsList) leg1StopsList.style.display = 'none';

      toggleLeg1Btn.onclick = async () => {
        if (!leg1StopsList) return;
        const isHidden = leg1StopsList.style.display === 'none';
        if (isHidden) {
          leg1StopsList.style.display = 'flex';
          if (btnSpan) btnSpan.textContent = `Hide Stops`;
          if (sampleTrain1?.id) {
            try {
              const rRes = await fetch(`/api/routes?trainId=${sampleTrain1.id}`);
              const rData = await rRes.json();
              if (rData && Array.isArray(rData.stops)) {
                const fromIdx = rData.stops.findIndex(st => st.station_id === fromStn.id);
                const toIdx = rData.stops.findIndex(st => st.station_id === hub.id);
                let legStops = rData.stops;
                if (fromIdx !== -1 && toIdx !== -1) {
                  const minI = Math.min(fromIdx, toIdx);
                  const maxI = Math.max(fromIdx, toIdx);
                  legStops = rData.stops.slice(minI, maxI + 1);
                }
                leg1StopsList.innerHTML = legStops.map((st, idx) => `
                  <div class="via-stop-row ${idx === 0 || idx === legStops.length - 1 ? 'terminal-stop' : ''}">
                    <span class="vs-bullet"></span>
                    <span class="vs-name">${st.station?.station_name || st.station_id}</span>
                    <span class="vs-time">${st.departure_time ? formatTime12(st.departure_time).formatted : ''}</span>
                  </div>
                `).join('');
              }
            } catch (e) {
              console.warn('Error loading leg stops:', e);
            }
          }
        } else {
          leg1StopsList.style.display = 'none';
          if (btnSpan) btnSpan.textContent = `View ${leg1StopsCount} Stops`;
        }
      };
    }

    // STEP 2: THE VIA INTERCHANGE HUB
    const hubStationName = document.getElementById('viaHubStationName');
    if (hubStationName) hubStationName.textContent = `${hub.name} Junction`;

    const transferWaitTag = document.getElementById('viaTransferWaitTag');
    if (transferWaitTag) transferWaitTag.textContent = `⏱️ ${hub.walkMin} min walk`;

    const switchLinesPill = document.getElementById('viaSwitchLinesPill');
    const toLineZone = getStationZoneOrLine(toStn);
    const fromShort = fromLineZone.includes('Western') ? 'WR' : (fromLineZone.includes('Harbour') ? 'HR' : 'CR');
    const toShort = toLineZone.includes('Western') ? 'WR' : (toLineZone.includes('Harbour') ? 'HR' : 'CR');
    if (switchLinesPill) switchLinesPill.textContent = `${fromShort} ➔ ${toShort} Switch`;

    const walkInstruction = document.getElementById('viaWalkInstruction');
    if (walkInstruction) walkInstruction.textContent = hub.walkDesc;

    const platInstruction = document.getElementById('viaPlatformInstruction');
    if (platInstruction) platInstruction.textContent = hub.platDesc.replace(/Thane \/ Kalyan/, toStn.name);

    // LEG 2 TRANSIT
    const leg2Title = document.getElementById('viaLeg2Title');
    if (leg2Title) leg2Title.textContent = `${toLineZone.split('•')[1]?.trim() || 'Suburban'} Local`;

    const leg2Duration = document.getElementById('viaLeg2Duration');
    if (leg2Duration) leg2Duration.textContent = `~${leg2Min} min`;

    const leg2Desc = document.getElementById('viaLeg2Desc');
    const leg2StopsCount = sampleTrain2 ? (sampleTrain2.stopsCount || 8) : 8;
    if (leg2Desc) leg2Desc.textContent = `Ride ${leg2StopsCount} stops from ${hub.name} to ${toStn.name}`;

    // Upcoming departures from Hub (Leg 2)
    const hubUpcomingPills = document.getElementById('viaHubUpcomingPills');
    if (hubUpcomingPills) {
      const top4 = viaOption?.leg2Trains ? viaOption.leg2Trains.slice(0, 4) : [];
      if (top4.length > 0) {
        hubUpcomingPills.innerHTML = top4.map(t => {
          const rawT = t.departureTime || t.fromStop?.departure_time || '09:30';
          const formatted = formatTime12(rawT);
          const isFast = isTrainFast(t);
          return `
            <span class="vu-chip ${isFast ? 'fast' : ''}">
              ${formatted.hhmm} ${formatted.ampm} ${isFast ? '⚡ Fast' : 'Slow'}
            </span>
          `;
        }).join('');
      } else {
        hubUpcomingPills.innerHTML = `<span class="vu-chip">Departures every 3-5 mins</span>`;
      }
    }

    // STEP 3: DESTINATION
    const destStationName = document.getElementById('viaDestStationName');
    if (destStationName) destStationName.textContent = toStn.name;

    const destLinePill = document.getElementById('viaDestLinePill');
    if (destLinePill) destLinePill.textContent = toLineZone;

    const destTimeVal = document.getElementById('viaDestTimeVal');
    if (destTimeVal) {
      const now = getMumbaiLiveDate();
      now.setMinutes(now.getMinutes() + totalMin);
      const arrH = now.getHours();
      const arrM = String(now.getMinutes()).padStart(2, '0');
      const ampm = arrH >= 12 ? 'PM' : 'AM';
      const arrH12 = arrH % 12 || 12;
      destTimeVal.textContent = `~${arrH12}:${arrM} ${ampm}`;
    }

    // Direct View toggle button
    const directBtn = document.getElementById('btnViaDirectView');
    if (directBtn) {
      const directExists = currentTrainResults && currentTrainResults.length > 0;
      directBtn.style.display = directExists ? 'block' : 'none';
    }

    // Switch screen to Screen 7!
    showScreen('screen-via-route');
  }

  // Event Listeners for Via Route Screen
  document.getElementById('btnOpenViaPlanner')?.addEventListener('click', async () => {
    if (selectedFromStation && selectedToStation) {
      const hubs = await findViaConnectingHubs(selectedFromStation.id, selectedToStation.id);
      currentViaOptions = hubs;
      renderViaRouteScreen(selectedFromStation, selectedToStation, hubs[0]?.hub.id, hubs);
    } else {
      showToast('Select origin and destination to view connecting route');
    }
  });

  document.getElementById('btnBackFromViaRoute')?.addEventListener('click', () => {
    if (currentTrainResults && currentTrainResults.length > 0) {
      showScreen('screen-train-results');
    } else {
      showScreen('screen-home');
    }
  });

  document.getElementById('btnViaReturnHome')?.addEventListener('click', () => {
    showScreen('screen-home');
  });

  document.getElementById('btnViaDirectView')?.addEventListener('click', () => {
    showScreen('screen-train-results');
  });

  document.getElementById('btnViaRouteFav')?.addEventListener('click', () => {
    const btn = document.getElementById('btnViaRouteFav');
    btn?.classList.toggle('active');
    const isFav = btn?.classList.contains('active');
    showToast(isFav ? '⭐ Connecting route saved to Favorites!' : 'Route removed from Favorites');
  });

  // Clear Results (if any remnants exist)
  document.getElementById('btnCloseResults')?.addEventListener('click', () => {
    showScreen('screen-home');
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
    selectedFromStation = null;
    selectedToStation = null;
    updateSearchClearIcons();
    checkShowResultsButton();
    renderStationDirectory(getStationsForDisplay());
  });

  // ==============================================================================
  // 6.5. PRODUCTION-GRADE MULTI-LINGUAL VOICE SEARCH SYSTEM (IMAGE EXACT MATCH)
  // - Hold mic button for 1 second to start recording (with progress ring feedback)
  // - Smooth morphing into glowing horizontal capsule pill containing audio waveform
  // - Real-time animated soundwave frequency bars (Image 2 visualizer)
  // - Multi-lingual NLP Engine supporting:
  //     1. English (e.g. "Dadar to Borivali", "Train from Dadar to Borivali")
  //     2. Hindi / Hinglish (e.g. "Mujhe Dadar se Borivali jana hai", "दादर से बोरिवली जाना है")
  //     3. Marathi / Marathlish (e.g. "Mala Dadar varun Borivali la jaycha aahe", "Thanyavarun Dadar")
  // - Automatic entity extraction, From/To auto-fill, and transition to live train results
  // ==============================================================================

  const VOICE_STATION_ALIASES = {
    'dadar': { id: 'stn_dr', name: 'Dadar', code: 'DR' },
    'ddr': { id: 'stn_dr', name: 'Dadar', code: 'DR' },
    'dr': { id: 'stn_dr', name: 'Dadar', code: 'DR' },
    'borivali': { id: 'stn_bvi', name: 'Borivali', code: 'BVI' },
    'boriwali': { id: 'stn_bvi', name: 'Borivali', code: 'BVI' },
    'bvi': { id: 'stn_bvi', name: 'Borivali', code: 'BVI' },
    'churchgate': { id: 'stn_ccg', name: 'Churchgate', code: 'CCG' },
    'ccg': { id: 'stn_ccg', name: 'Churchgate', code: 'CCG' },
    'virar': { id: 'stn_vr', name: 'Virar', code: 'VR' },
    'vr': { id: 'stn_vr', name: 'Virar', code: 'VR' },
    'andheri': { id: 'stn_adh', name: 'Andheri', code: 'ADH' },
    'adh': { id: 'stn_adh', name: 'Andheri', code: 'ADH' },
    'bandra': { id: 'stn_ba', name: 'Bandra', code: 'BA' },
    'ba': { id: 'stn_ba', name: 'Bandra', code: 'BA' },
    'vandre': { id: 'stn_ba', name: 'Bandra', code: 'BA' },
    'mumbai central': { id: 'stn_mmct', name: 'Mumbai Central', code: 'MMCT' },
    'bombay central': { id: 'stn_mmct', name: 'Mumbai Central', code: 'MMCT' },
    'mmct': { id: 'stn_mmct', name: 'Mumbai Central', code: 'MMCT' },
    'bct': { id: 'stn_mmct', name: 'Mumbai Central', code: 'MMCT' },
    'marine lines': { id: 'stn_mel', name: 'Marine Lines', code: 'MEL' },
    'charni road': { id: 'stn_cyr', name: 'Charni Road', code: 'CYR' },
    'grant road': { id: 'stn_gtr', name: 'Grant Road', code: 'GTR' },
    'mahalaxmi': { id: 'stn_mx', name: 'Mahalaxmi', code: 'MX' },
    'lower parel': { id: 'stn_pl', name: 'Lower Parel', code: 'PL' },
    'prabhadevi': { id: 'stn_pbhd', name: 'Prabhadevi', code: 'PBHD' },
    'elphinstone': { id: 'stn_pbhd', name: 'Prabhadevi', code: 'PBHD' },
    'matunga road': { id: 'stn_mru', name: 'Matunga Road', code: 'MRU' },
    'matunga': { id: 'stn_mtn', name: 'Matunga', code: 'MTN' },
    'mahim': { id: 'stn_mm', name: 'Mahim', code: 'MM' },
    'khar': { id: 'stn_khar', name: 'Khar Road', code: 'KHAR' },
    'khar road': { id: 'stn_khar', name: 'Khar Road', code: 'KHAR' },
    'santacruz': { id: 'stn_stc', name: 'Santacruz', code: 'STC' },
    'santa cruz': { id: 'stn_stc', name: 'Santacruz', code: 'STC' },
    'vile parle': { id: 'stn_vlp', name: 'Vile Parle', code: 'VLP' },
    'parle': { id: 'stn_vlp', name: 'Vile Parle', code: 'VLP' },
    'jogeshwari': { id: 'stn_jos', name: 'Jogeshwari', code: 'JOS' },
    'ram mandir': { id: 'stn_rmar', name: 'Ram Mandir', code: 'RMAR' },
    'goregaon': { id: 'stn_gmn', name: 'Goregaon', code: 'GMN' },
    'malad': { id: 'stn_mdd', name: 'Malad', code: 'MDD' },
    'kandivali': { id: 'stn_kile', name: 'Kandivali', code: 'KILE' },
    'kandivli': { id: 'stn_kile', name: 'Kandivali', code: 'KILE' },
    'dahisar': { id: 'stn_dic', name: 'Dahisar', code: 'DIC' },
    'mira road': { id: 'stn_mira', name: 'Mira Road', code: 'MIRA' },
    'bhayandar': { id: 'stn_byr', name: 'Bhayandar', code: 'BYR' },
    'bhayander': { id: 'stn_byr', name: 'Bhayandar', code: 'BYR' },
    'naigaon': { id: 'stn_nig', name: 'Naigaon', code: 'NIG' },
    'vasai': { id: 'stn_bsr', name: 'Vasai Road', code: 'BSR' },
    'vasai road': { id: 'stn_bsr', name: 'Vasai Road', code: 'BSR' },
    'bassein': { id: 'stn_bsr', name: 'Vasai Road', code: 'BSR' },
    'nallasopara': { id: 'stn_nsp', name: 'Nallasopara', code: 'NSP' },
    'nalasopara': { id: 'stn_nsp', name: 'Nallasopara', code: 'NSP' },
    'nala sopara': { id: 'stn_nsp', name: 'Nallasopara', code: 'NSP' },
    'nsp': { id: 'stn_nsp', name: 'Nallasopara', code: 'NSP' },
    'palghar': { id: 'stn_plg', name: 'Palghar', code: 'PLG' },
    'boisar': { id: 'stn_bor', name: 'Boisar', code: 'BOR' },
    'dahanu': { id: 'stn_drd', name: 'Dahanu Road', code: 'DRD' },
    'dahanu road': { id: 'stn_drd', name: 'Dahanu Road', code: 'DRD' },
    'csmt': { id: 'stn_csmt', name: 'CSMT', code: 'CSMT' },
    'cst': { id: 'stn_csmt', name: 'CSMT', code: 'CSMT' },
    'vt': { id: 'stn_csmt', name: 'CSMT', code: 'CSMT' },
    'victoria terminus': { id: 'stn_csmt', name: 'CSMT', code: 'CSMT' },
    'chhatrapati shivaji': { id: 'stn_csmt', name: 'CSMT', code: 'CSMT' },
    'byculla': { id: 'stn_by', name: 'Byculla', code: 'BY' },
    'parel': { id: 'stn_pr', name: 'Parel', code: 'PR' },
    'sion': { id: 'stn_sin', name: 'Sion', code: 'SIN' },
    'kurla': { id: 'stn_cla', name: 'Kurla', code: 'CLA' },
    'ghatkopar': { id: 'stn_gc', name: 'Ghatkopar', code: 'GC' },
    'vikhroli': { id: 'stn_vk', name: 'Vikhroli', code: 'VK' },
    'bhandup': { id: 'stn_bnd', name: 'Bhandup', code: 'BND' },
    'mulund': { id: 'stn_mlnd', name: 'Mulund', code: 'MLND' },
    'thane': { id: 'stn_tna', name: 'Thane', code: 'TNA' },
    'thana': { id: 'stn_tna', name: 'Thane', code: 'TNA' },
    'thanya': { id: 'stn_tna', name: 'Thane', code: 'TNA' },
    'tna': { id: 'stn_tna', name: 'Thane', code: 'TNA' },
    'kalva': { id: 'stn_klva', name: 'Kalva', code: 'KLVA' },
    'mumbra': { id: 'stn_mbq', name: 'Mumbra', code: 'MBQ' },
    'diva': { id: 'stn_diva', name: 'Diva', code: 'DIVA' },
    'dombivli': { id: 'stn_di', name: 'Dombivli', code: 'DI' },
    'dombivali': { id: 'stn_di', name: 'Dombivli', code: 'DI' },
    'kalyan': { id: 'stn_kyn', name: 'Kalyan', code: 'KYN' },
    'kyn': { id: 'stn_kyn', name: 'Kalyan', code: 'KYN' },
    'ambernath': { id: 'stn_abh', name: 'Ambernath', code: 'ABH' },
    'badlapur': { id: 'stn_bud', name: 'Badlapur', code: 'BUD' },
    'karjat': { id: 'stn_kjt', name: 'Karjat', code: 'KJT' },
    'kasara': { id: 'stn_ksra', name: 'Kasara', code: 'KSRA' },
    'titwala': { id: 'stn_tla', name: 'Titwala', code: 'TLA' },
    'vashi': { id: 'stn_vsh', name: 'Vashi', code: 'VSH' },
    'nerul': { id: 'stn_neu', name: 'Nerul', code: 'NEU' },
    'belapur': { id: 'stn_bepr', name: 'Belapur', code: 'BEPR' },
    'panvel': { id: 'stn_pnvl', name: 'Panvel', code: 'PNVL' },
    'wadala road': { id: 'stn_vdlr', name: 'Vadala Road', code: 'VDLR' },
    'vadala road': { id: 'stn_vdlr', name: 'Vadala Road', code: 'VDLR' },
    'chembur': { id: 'stn_cmbr', name: 'Chembur', code: 'CMBR' }
  };

  const DEVANAGARI_TRANSLATION_MAP = {
    'दादर': 'dadar',
    'बोरिवली': 'borivali',
    'बोरिवलीला': 'borivali la',
    'चर्चगेट': 'churchgate',
    'चर्चगेटला': 'churchgate la',
    'विरार': 'virar',
    'विरारला': 'virar la',
    'अंधेरी': 'andheri',
    'अंधेरीला': 'andheri la',
    'ठाणे': 'thane',
    'ठाण्यावरून': 'thane varun',
    'ठाण्या': 'thane',
    'कल्याण': 'kalyan',
    'कल्याणला': 'kalyan la',
    'सीएसएमटी': 'csmt',
    'सीएसटी': 'csmt',
    'कुर्ला': 'kurla',
    'वांद्रे': 'bandra',
    'मुंबई सेंट्रल': 'mumbai central',
    'जाना है': ' jana hai ',
    'जाना': ' jana ',
    'जायचं आहे': ' jaycha aahe ',
    'जायचंय': ' jaycha aahe ',
    'जायचं': ' jaycha aahe ',
    'मला': ' mala ',
    'वरून': ' varun ',
    'हून': ' hun ',
    'पासून': ' pasun ',
    'पर्यंत': ' paryant ',
    'गाडी': ' train ',
    'ट्रेन': ' train ',
    'लोकल': ' local ',
    'फास्ट': ' fast ',
    'जलद': ' fast ',
    'धीमी': ' slow ',
    'स्लो': ' slow ',
    'से': ' se ',
    'ते': ' te ',
    'ला': ' la ',
    'तक': ' tak '
  };

  /**
   * Normalizes input utterance, maps Devanagari script, and splits Marathi/Hindi suffixes
   */
  function normalizeVoiceUtterance(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let text = ' ' + raw.toLowerCase() + ' ';
    
    // Sort Devanagari map by length descending to prevent substring collisions
    const sortedDev = Object.entries(DEVANAGARI_TRANSLATION_MAP).sort((a, b) => b[0].length - a[0].length);
    for (const [dev, lat] of sortedDev) {
      text = text.split(dev).join(' ' + lat + ' ');
    }
    text = text.replace(/[,.?!:;()]/g, ' ');

    // Suffix splitting for Latin words (e.g. 'Dadarvarun' -> 'dadar varun', 'Borivalila' -> 'borivali la')
    const words = text.split(/\s+/).filter(Boolean);
    const transformed = [];
    for (const w of words) {
      if (w.endsWith('varun') && w.length > 5) {
        transformed.push(w.slice(0, -5));
        transformed.push('varun');
      } else if (w.endsWith('hun') && w.length > 4) {
        transformed.push(w.slice(0, -3));
        transformed.push('hun');
      } else if (w.endsWith('pasun') && w.length > 5) {
        transformed.push(w.slice(0, -5));
        transformed.push('pasun');
      } else if (w.endsWith('paryant') && w.length > 7) {
        transformed.push(w.slice(0, -7));
        transformed.push('paryant');
      } else if (w.endsWith('la') && w.length > 4 && !['shila', 'kurla', 'byculla'].includes(w)) {
        transformed.push(w.slice(0, -2));
        transformed.push('la');
      } else if (w.endsWith('se') && w.length > 4) {
        transformed.push(w.slice(0, -2));
        transformed.push('se');
      } else {
        transformed.push(w);
      }
    }

    // Normalizing colloquial forms
    for (let i = 0; i < transformed.length; i++) {
      if (transformed[i] === 'thanya') transformed[i] = 'thane';
      if (transformed[i] === 'boriwali') transformed[i] = 'borivali';
    }

    return transformed.join(' ');
  }

  /**
   * Resolves a station entity name against both alias directory and dynamic loaded allStations
   */
  function resolveVoiceStationEntity(rawName) {
    if (!rawName) return null;
    const clean = rawName.toLowerCase().trim();

    // 1. Alias dictionary
    if (VOICE_STATION_ALIASES[clean]) {
      const alias = VOICE_STATION_ALIASES[clean];
      const match = (allStations || []).find(s => 
        s.id === alias.id ||
        (s.station_code && s.station_code.toUpperCase() === alias.code.toUpperCase()) ||
        s.station_name.toLowerCase() === alias.name.toLowerCase()
      );
      return match || { id: alias.id, station_name: alias.name, station_code: alias.code };
    }

    // 2. Exact match in allStations
    if (allStations && allStations.length > 0) {
      const exact = allStations.find(s => 
        s.station_name.toLowerCase() === clean || 
        (s.station_code && s.station_code.toLowerCase() === clean) ||
        (s.normalized_name && s.normalized_name.toLowerCase() === clean)
      );
      if (exact) return exact;

      // 3. Prefix or alias match in allStations
      const prefix = allStations.find(s => {
        if (s.station_name.toLowerCase().startsWith(clean)) return true;
        if (Array.isArray(s.aliases) && s.aliases.some(a => a.toLowerCase() === clean || a.toLowerCase().startsWith(clean))) return true;
        return false;
      });
      if (prefix) return prefix;
    }

    return null;
  }

  /**
   * Multi-Lingual Natural Language Processing Engine for Train Queries
   */
  function parseMultiLingualVoiceQuery(rawSentence) {
    const norm = normalizeVoiceUtterance(rawSentence);

    // 1. Detect Language
    let detectedLang = 'English';
    if (/(\b(se|jana|jaana|hai|humko|kaise|batao|dikhao|chahiye|ke liye|tak)\b)/i.test(norm)) {
      detectedLang = 'Hindi';
    } else if (/(\b(varun|hun|pasun|te|jaycha|aahe|gadi|kuthe|dakhva|paryant|mala)\b)/i.test(norm)) {
      detectedLang = 'Marathi';
    }

    // 2. Detect Train Type Modifier (Fast / AC / Slow)
    let trainTypeFilter = null;
    if (/\b(fast|jalad)\b/i.test(norm)) trainTypeFilter = 'FAST';
    else if (/\b(ac|air conditioned)\b/i.test(norm)) trainTypeFilter = 'AC';
    else if (/\b(slow|dhimi)\b/i.test(norm)) trainTypeFilter = 'SLOW';

    // 3. Match Station Tokens
    const matchedStations = [];
    const aliasKeys = Object.keys(VOICE_STATION_ALIASES).sort((a, b) => b.length - a.length);
    for (const alias of aliasKeys) {
      const regex = new RegExp('\\b' + alias + '\\b', 'gi');
      let m;
      while ((m = regex.exec(norm)) !== null) {
        matchedStations.push({
          station: VOICE_STATION_ALIASES[alias],
          index: m.index,
          length: alias.length,
          match: alias
        });
      }
    }

    // Deduplicate overlapping tokens (favor longest matches like 'mumbai central' over 'mumbai')
    matchedStations.sort((a, b) => a.index - b.index || b.length - a.length);
    const deduplicated = [];
    for (const s of matchedStations) {
      const overlaps = deduplicated.some(e => 
        (s.index >= e.index && s.index < e.index + e.length) ||
        (e.index >= s.index && e.index < s.index + s.length)
      );
      if (!overlaps) deduplicated.push(s);
    }
    matchedStations.length = 0;
    matchedStations.push(...deduplicated.sort((a, b) => a.index - b.index));

    // Fallback station resolution against allStations directly if token wasn't in alias dict
    if (matchedStations.length < 2 && allStations && allStations.length > 0) {
      const words = norm.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (w.length < 3) continue;
        if (['from', 'train', 'local', 'jana', 'aahe', 'mala'].includes(w)) continue;
        const foundStn = allStations.find(s => s.station_name.toLowerCase() === w || (s.station_code && s.station_code.toLowerCase() === w));
        if (foundStn && !matchedStations.some(m => m.station.id === foundStn.id)) {
          const idx = norm.indexOf(w);
          matchedStations.push({
            station: { id: foundStn.id, name: foundStn.station_name, code: foundStn.station_code },
            index: idx >= 0 ? idx : 0,
            length: w.length,
            match: w
          });
        }
      }
      matchedStations.sort((a, b) => a.index - b.index);
    }

    let fromEntity = null;
    let toEntity = null;

    // Default origin = currently selected From station, or user's detected station, or Dadar
    const defaultOrigin = (selectedFromStation && selectedFromStation.id)
      ? { id: selectedFromStation.id, station_name: selectedFromStation.name, station_code: '' }
      : ((allStations && currentUserStationCode) 
        ? allStations.find(s => s.station_code && s.station_code.toUpperCase() === currentUserStationCode)
        : (allStations && allStations.find(s => s.id === 'stn_dr')) || { id: 'stn_dr', station_name: 'Dadar', station_code: 'DR' });

    // 4. Grammar & Route Extraction
    if (matchedStations.length >= 2) {
      const s1 = matchedStations[0];
      const s2 = matchedStations[1];
      const between = norm.slice(s1.index + s1.length, s2.index);
      const afterS2 = norm.slice(s2.index + s2.length);

      // Inverted Rule:
      // e.g. "To Borivali from Dadar" OR "Borivali jana hai Dadar se" OR "Borivalila jaycha aahe Dadar varun"
      if (
        /(\b(from)\b)/i.test(between) || 
        (/(\b(se|varun|hun|pasun)\b)/i.test(afterS2) && !/(\b(se|varun|hun|pasun)\b)/i.test(between))
      ) {
        fromEntity = resolveVoiceStationEntity(s2.station.name);
        toEntity = resolveVoiceStationEntity(s1.station.name);
      } else {
        // Standard Rule: S1 [se / to / te / varun / hun] S2
        fromEntity = resolveVoiceStationEntity(s1.station.name);
        toEntity = resolveVoiceStationEntity(s2.station.name);
      }
    } else if (matchedStations.length === 1) {
      const single = matchedStations[0];
      const before = norm.slice(0, single.index);
      const after = norm.slice(single.index + single.length);

      // If origin keyword followed, it is origin
      if (/(\b(se|varun|hun|pasun|from)\b)/i.test(after) || /(\b(from)\b)/i.test(before)) {
        fromEntity = resolveVoiceStationEntity(single.station.name);
        toEntity = null;
      } else {
        // Destination only query (e.g. "Borivali jana hai", "Borivalila jaychay")
        fromEntity = defaultOrigin;
        toEntity = resolveVoiceStationEntity(single.station.name);
      }
    }

    // Auto-fill fallback if user said only one station
    if (fromEntity && !toEntity) {
      if (selectedToStation && selectedToStation.id && selectedToStation.id !== fromEntity.id) {
        toEntity = { id: selectedToStation.id, station_name: selectedToStation.name };
      } else {
        toEntity = (fromEntity.id === 'stn_vr' || fromEntity.station_code === 'VR')
          ? { id: 'stn_ccg', station_name: 'Churchgate' }
          : { id: 'stn_vr', station_name: 'Virar' };
      }
    } else if (!fromEntity && toEntity) {
      fromEntity = defaultOrigin;
    }

    return {
      raw: rawSentence,
      detectedLang,
      trainTypeFilter,
      from: fromEntity,
      to: toEntity
    };
  }

  // ==============================================================================
  // 6.6. VOICE UI CONTROLLER, TAP-OR-HOLD GESTURE & AUDIO WAVEFORM
  // ==============================================================================

  const voiceSystemEl = document.getElementById('voiceSearchSystem');
  const voiceCapsuleBar = document.getElementById('voiceCapsuleBar');
  const btnVoiceFab = document.getElementById('btnVoiceFab');
  const micHoldRingFill = document.getElementById('micHoldRingFill');
  const voiceHudBubble = document.getElementById('voiceHudBubble');
  const voiceHudDot = document.getElementById('voiceHudDot');
  const voiceHudBadge = document.getElementById('voiceHudLangBadge');
  const voiceHudHint = document.getElementById('voiceHudHint');
  const voiceHudTranscript = document.getElementById('voiceHudTranscript');
  const voiceWaveformArea = document.getElementById('voiceWaveformArea');

  let holdTimer = null;
  let holdProgressInterval = null;
  let holdStartTime = 0;
  let isHoldGesture = false;
  let isRecordingActive = false;
  let speechRecognizer = null;
  let currentSpokenTranscript = '';
  let voiceSilenceTimer = null;
  let recognitionLanguage = 'hi-IN'; // defaults to Hindi / Hinglish with auto multilingual fallback

  // Initialize Speech Recognition with robust transcript collection (interim & final)
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    try {
      const recog = new SpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = recognitionLanguage;

      recog.onresult = (event) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i][0] && event.results[i][0].transcript) {
            fullTranscript += event.results[i][0].transcript + ' ';
          }
        }
        fullTranscript = fullTranscript.trim();
        if (fullTranscript) {
          currentSpokenTranscript = fullTranscript;
          if (voiceHudTranscript) {
            voiceHudTranscript.textContent = `"${fullTranscript}"`;
            voiceHudTranscript.classList.remove('detected');
          }

          // Auto-execute if user pauses for 1.8 seconds after speaking
          clearTimeout(voiceSilenceTimer);
          voiceSilenceTimer = setTimeout(() => {
            if (isRecordingActive && currentSpokenTranscript && currentSpokenTranscript.trim()) {
              stopVoiceRecordingAndExecute();
            }
          }, 1800);
        }
      };

      recog.onend = () => {
        if (isRecordingActive && currentSpokenTranscript && currentSpokenTranscript.trim()) {
          stopVoiceRecordingAndExecute();
        }
      };

      recog.onerror = (err) => {
        console.warn('SpeechRecognition error:', err.error);
        if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
          if (voiceHudBadge) voiceHudBadge.textContent = '⚠️ Mic permission required';
          if (voiceHudHint) voiceHudHint.textContent = 'Please allow mic or tap a phrase below';
        }
      };

      return recog;
    } catch (e) {
      console.warn('SpeechRecognition init error:', e);
      return null;
    }
  }

  speechRecognizer = initSpeechRecognition();

  // Reset Progress Ring
  function resetHoldRing() {
    if (micHoldRingFill) {
      micHoldRingFill.style.strokeDashoffset = '144.5';
    }
    if (btnVoiceFab) {
      btnVoiceFab.classList.remove('is-holding');
    }
  }

  // Start Recording State (Supports both quick tap and hold-to-speak)
  function startVoiceRecording(explicitLang = 'Hindi • मराठी • English') {
    isRecordingActive = true;
    currentSpokenTranscript = '';
    clearTimeout(voiceSilenceTimer);

    // Expand capsule to left into horizontal pill
    voiceCapsuleBar?.classList.add('recording-active');

    // Show floating HUD Bubble
    voiceHudBubble?.classList.add('active');
    voiceHudDot?.classList.add('recording');
    if (voiceHudBadge) voiceHudBadge.textContent = `🎙️ Listening (${explicitLang})`;
    if (voiceHudHint) voiceHudHint.textContent = 'Speak route (e.g. "Dadar se Borivali")';
    if (voiceHudTranscript) {
      voiceHudTranscript.textContent = 'Listening... Speak your station';
      voiceHudTranscript.classList.remove('detected');
    }

    // Haptic vibration feedback if available
    try {
      if (navigator.vibrate) navigator.vibrate([40]);
    } catch (e) {}

    // Start browser speech recognition
    if (speechRecognizer) {
      try {
        speechRecognizer.start();
      } catch (e) {}
    }
  }

  // Stop Recording and Execute Route NLP Search
  function stopVoiceRecordingAndExecute(fallbackUtterance = null) {
    if (!isRecordingActive && !fallbackUtterance) return;
    isRecordingActive = false;
    clearTimeout(voiceSilenceTimer);

    if (speechRecognizer) {
      try {
        speechRecognizer.stop();
      } catch (e) {}
    }

    voiceHudDot?.classList.remove('recording');

    const spokenText = (fallbackUtterance || currentSpokenTranscript || '').trim();
    if (!spokenText) {
      if (voiceHudBadge) {
        voiceHudBadge.textContent = '💡 Tap or hold mic to speak';
      }
      if (voiceHudHint) {
        voiceHudHint.textContent = 'Or tap any route phrase below';
      }
      if (voiceHudTranscript) {
        voiceHudTranscript.textContent = 'Say: "Dadar se Borivali" or "Churchgate to Virar"';
      }
      setTimeout(() => {
        if (!isRecordingActive) {
          voiceCapsuleBar?.classList.remove('recording-active');
          voiceHudBubble?.classList.remove('active');
          resetHoldRing();
        }
      }, 2000);
      return;
    }
    
    // Process through Multi-Lingual NLP Engine
    const parseResult = parseMultiLingualVoiceQuery(spokenText);

    if (voiceHudTranscript) {
      voiceHudTranscript.textContent = `"${spokenText}"`;
    }

    if (parseResult && parseResult.from && parseResult.to) {
      const fromName = parseResult.from.station_name || parseResult.from.name || 'Dadar';
      const toName = parseResult.to.station_name || parseResult.to.name || 'Borivali';

      // Success match!
      if (voiceHudBadge) {
        voiceHudBadge.textContent = `✓ [${parseResult.detectedLang}] ${fromName} ➔ ${toName}`;
      }
      if (voiceHudHint) {
        voiceHudHint.textContent = parseResult.trainTypeFilter ? `${parseResult.trainTypeFilter} Train` : 'Finding trains...';
      }
      voiceHudTranscript?.classList.add('detected');

      showToast(`🎙️ Voice Search: ${fromName} ➔ ${toName} (${parseResult.detectedLang})`, 2500);

      // Fast transition to results screen (300ms)
      setTimeout(() => {
        // Collapse capsule back smoothly
        voiceCapsuleBar?.classList.remove('recording-active');
        voiceHudBubble?.classList.remove('active');
        resetHoldRing();

        // Populate search fields
        selectedFromStation = { id: parseResult.from.id, name: fromName };
        selectedToStation = { id: parseResult.to.id, name: toName };
        selectedDirectionFilter = null;

        if (fromInput) fromInput.value = fromName;
        if (toInput) toInput.value = toName;

        if (tileCenterExtension) {
          tileCenterExtension.classList.remove('expanded');
        }

        updateSearchClearIcons();
        checkShowResultsButton();

        // Apply train filter if spoken (e.g. "Fast train")
        if (parseResult.trainTypeFilter) {
          currentTimetableFilter = parseResult.trainTypeFilter;
          document.querySelectorAll('.timetable-filter-pill').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === currentTimetableFilter);
          });
        }

        // Navigate to full train timetable results screen!
        searchTrains();
      }, 300);
    } else {
      // Incomplete route spoken
      if (voiceHudBadge) {
        voiceHudBadge.textContent = '💡 Try: "[Station] to [Station]"';
      }
      if (voiceHudHint) {
        voiceHudHint.textContent = 'Or tap a phrase below';
      }

      setTimeout(() => {
        if (!isRecordingActive) {
          voiceCapsuleBar?.classList.remove('recording-active');
          resetHoldRing();
        }
      }, 2000);
    }
  }

  // Handle Press & Hold and Tap Gestures on Microphone Button
  function handleMicPressStart(e) {
    if (e && e.type !== 'touchstart') e.preventDefault();
    holdStartTime = Date.now();
    isHoldGesture = false;
    btnVoiceFab?.classList.add('is-holding');

    const HOLD_THRESHOLD_MS = 380;
    const intervalStep = 20;

    clearInterval(holdProgressInterval);
    clearTimeout(holdTimer);

    holdProgressInterval = setInterval(() => {
      const elapsed = Date.now() - holdStartTime;
      const progress = Math.min(1, elapsed / HOLD_THRESHOLD_MS);
      const offset = 144.5 * (1 - progress);
      if (micHoldRingFill) {
        micHoldRingFill.style.strokeDashoffset = offset.toFixed(1);
      }
      if (progress >= 1) {
        clearInterval(holdProgressInterval);
      }
    }, intervalStep);

    // If held for >= 380ms, activate hold-to-speak recording
    holdTimer = setTimeout(() => {
      isHoldGesture = true;
      if (!isRecordingActive) {
        startVoiceRecording();
      }
    }, HOLD_THRESHOLD_MS);
  }

  function handleMicPressEnd() {
    clearTimeout(holdTimer);
    clearInterval(holdProgressInterval);
    const holdElapsed = Date.now() - holdStartTime;
    resetHoldRing();

    if (isHoldGesture || holdElapsed >= 380) {
      // User performed a press-and-hold gesture -> stop and execute!
      if (isRecordingActive) {
        stopVoiceRecordingAndExecute();
      }
    } else {
      // User performed a simple tap!
      if (isRecordingActive) {
        // Tapped while recording -> stop and execute!
        stopVoiceRecordingAndExecute();
      } else {
        // Tapped while idle -> toggle voice listening immediately!
        startVoiceRecording();
      }
    }
  }

  // Pointer & Touch Events on btnVoiceFab
  if (btnVoiceFab) {
    btnVoiceFab.addEventListener('pointerdown', (e) => {
      handleMicPressStart(e);
    });

    window.addEventListener('pointerup', () => {
      if (holdStartTime > 0) {
        handleMicPressEnd();
        holdStartTime = 0;
      }
    });

    window.addEventListener('pointercancel', () => {
      clearTimeout(holdTimer);
      clearInterval(holdProgressInterval);
      resetHoldRing();
      holdStartTime = 0;
    });
  }

  // Interactive Quick-Test Voice Chips (Hindi, Marathi, English)
  document.querySelectorAll('.voice-chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const phrase = btn.getAttribute('data-phrase');
      const lang = btn.getAttribute('data-lang') || 'Multi-lingual';
      if (!phrase) return;

      // Expand capsule and show wave animation
      startVoiceRecording(lang);
      if (voiceHudTranscript) {
        voiceHudTranscript.textContent = `"${phrase}"`;
      }

      // Simulate 1.1s voice utterance duration, then execute search
      setTimeout(() => {
        stopVoiceRecordingAndExecute(phrase);
      }, 1100);
    });
  });

  // Close HUD bubble when tapping outside
  document.addEventListener('click', (e) => {
    if (!voiceSystemEl?.contains(e.target) && voiceHudBubble?.classList.contains('active') && !isRecordingActive) {
      voiceHudBubble.classList.remove('active');
    }
  });

  // ==========================================
  // 7. SCREEN 6: TRAIN JOURNEY / ROUTE STOPS VIEW
  // ==========================================

  function isMajorStation(name, code, isOrigin, isDestination) {
    if (isOrigin || isDestination) return true;
    const n = (name || '').toLowerCase();
    const c = (code || '').toUpperCase();
    const majorList = [
      'churchgate', 'mumbai central', 'dadar', 'bandra', 'andheri', 'borivali', 
      'bhayandar', 'vasai road', 'virar', 'palghar', 'dahanu road',
      'csmt', 'chhatrapati shivaji', 'byculla', 'kurla', 'ghatkopar', 'thane', 
      'dombivli', 'kalyan', 'ambernath', 'badlapur', 'karjat', 'titwala', 'kasara',
      'vadala road', 'chembur', 'vashi', 'nerul', 'belapur', 'panvel'
    ];
    if (majorList.some(m => n.includes(m))) return true;
    const majorCodes = ['CCG', 'MMCT', 'BCT', 'DDR', 'BA', 'ADH', 'BVI', 'BYR', 'BSR', 'VR', 'CSMT', 'BY', 'CLA', 'GC', 'TNA', 'DI', 'KYN', 'VSH', 'PNVL'];
    return majorCodes.includes(c);
  }

  const CORRIDOR_WESTERN = [
    { name: 'Churchgate', code: 'CCG', major: true },
    { name: 'Marine Lines', code: 'MEL', major: false },
    { name: 'Charni Road', code: 'CYR', major: false },
    { name: 'Grant Road', code: 'GTR', major: false },
    { name: 'Mumbai Central', code: 'MMCT', major: true },
    { name: 'Mahalaxmi', code: 'MX', major: false },
    { name: 'Lower Parel', code: 'PL', major: false },
    { name: 'Prabhadevi', code: 'PBHD', major: false },
    { name: 'Dadar', code: 'DDR', major: true },
    { name: 'Matunga Road', code: 'MRU', major: false },
    { name: 'Mahim', code: 'MM', major: false },
    { name: 'Bandra', code: 'BA', major: true },
    { name: 'Khar Road', code: 'KHAR', major: false },
    { name: 'Santa Cruz', code: 'STC', major: false },
    { name: 'Vile Parle', code: 'VLP', major: false },
    { name: 'Andheri', code: 'ADH', major: true },
    { name: 'Jogeshwari', code: 'JOS', major: false },
    { name: 'Ram Mandir', code: 'RMAR', major: false },
    { name: 'Goregaon', code: 'GMN', major: false },
    { name: 'Malad', code: 'MDD', major: false },
    { name: 'Kandivali', code: 'KILE', major: false },
    { name: 'Borivali', code: 'BVI', major: true },
    { name: 'Dahisar', code: 'DIC', major: false },
    { name: 'Mira Road', code: 'MIRA', major: false },
    { name: 'Bhayandar', code: 'BYR', major: true },
    { name: 'Naigaon', code: 'NIG', major: false },
    { name: 'Vasai Road', code: 'BSR', major: true },
    { name: 'Nallasopara', code: 'NSP', major: false },
    { name: 'Virar', code: 'VR', major: true },
    { name: 'Vaitarna', code: 'VTN', major: false },
    { name: 'Saphale', code: 'SAH', major: false },
    { name: 'Kelve Road', code: 'KLV', major: false },
    { name: 'Palghar', code: 'PLG', major: true },
    { name: 'Umroli', code: 'UOI', major: false },
    { name: 'Boisar', code: 'BOR', major: true },
    { name: 'Vangaon', code: 'VGN', major: false },
    { name: 'Dahanu Road', code: 'DRD', major: true }
  ];

  const CORRIDOR_CENTRAL = [
    { name: 'CSMT', code: 'CSMT', major: true },
    { name: 'Masjid', code: 'MSD', major: false },
    { name: 'Sandhurst Road', code: 'SNRD', major: false },
    { name: 'Byculla', code: 'BY', major: true },
    { name: 'Chinchpokli', code: 'CHG', major: false },
    { name: 'Currey Road', code: 'CRD', major: false },
    { name: 'Parel', code: 'PR', major: false },
    { name: 'Dadar', code: 'DR', major: true },
    { name: 'Matunga', code: 'MTN', major: false },
    { name: 'Sion', code: 'SIN', major: false },
    { name: 'Kurla', code: 'CLA', major: true },
    { name: 'Vidyavihar', code: 'VVH', major: false },
    { name: 'Ghatkopar', code: 'GC', major: true },
    { name: 'Vikhroli', code: 'VK', major: false },
    { name: 'Kanjurmarg', code: 'KJRD', major: false },
    { name: 'Bhandup', code: 'BND', major: false },
    { name: 'Nahur', code: 'NHU', major: false },
    { name: 'Mulund', code: 'MLND', major: true },
    { name: 'Thane', code: 'TNA', major: true },
    { name: 'Kalva', code: 'KLVA', major: false },
    { name: 'Mumbra', code: 'MBQ', major: false },
    { name: 'Diva', code: 'DIVA', major: false },
    { name: 'Kopar', code: 'KOPR', major: false },
    { name: 'Dombivli', code: 'DI', major: true },
    { name: 'Thakurli', code: 'THK', major: false },
    { name: 'Kalyan', code: 'KYN', major: true },
    { name: 'Vithalwadi', code: 'VLDI', major: false },
    { name: 'Ulhasnagar', code: 'ULNR', major: false },
    { name: 'Ambernath', code: 'ABH', major: true },
    { name: 'Badlapur', code: 'BUD', major: true },
    { name: 'Karjat', code: 'KJT', major: true },
    { name: 'Titwala', code: 'TLA', major: true },
    { name: 'Asangaon', code: 'ASO', major: true },
    { name: 'Kasara', code: 'KSRA', major: true }
  ];

  const CORRIDOR_HARBOUR = [
    { name: 'CSMT', code: 'CSMT', major: true },
    { name: 'Masjid', code: 'MSD', major: false },
    { name: 'Sandhurst Road', code: 'SNRD', major: false },
    { name: 'Dockyard Road', code: 'DKRD', major: false },
    { name: 'Reay Road', code: 'RRD', major: false },
    { name: 'Cotton Green', code: 'CTGN', major: false },
    { name: 'Sewri', code: 'SVE', major: false },
    { name: 'Vadala Road', code: 'VDLR', major: true },
    { name: 'GTB Nagar', code: 'GTBN', major: false },
    { name: 'Chunabhatti', code: 'CHF', major: false },
    { name: 'Kurla', code: 'CLA', major: true },
    { name: 'Tilak Nagar', code: 'TKNG', major: false },
    { name: 'Chembur', code: 'CMBR', major: true },
    { name: 'Govandi', code: 'GV', major: false },
    { name: 'Mankhurd', code: 'MNKD', major: false },
    { name: 'Vashi', code: 'VSH', major: true },
    { name: 'Sanpada', code: 'SNPD', major: false },
    { name: 'Juinagar', code: 'JNJ', major: false },
    { name: 'Nerul', code: 'NEU', major: true },
    { name: 'Seawoods Darave', code: 'SWDV', major: false },
    { name: 'Belapur CBD', code: 'BEPR', major: true },
    { name: 'Kharghar', code: 'KHAG', major: false },
    { name: 'Mansarovar', code: 'MANR', major: false },
    { name: 'Khandeshwar', code: 'KNDS', major: false },
    { name: 'Panvel', code: 'PNVL', major: true }
  ];

  function buildFullCorridorRouteStops(trainItem, apiStops) {
    const isFast = isTrainFast(trainItem);
    const origName = trainItem.originStation?.station_name || 'Churchgate';
    const destName = trainItem.destinationStation?.station_name || 'Virar';
    const lineName = (trainItem.line?.name || '').toLowerCase();

    function norm(str) {
      if (!str) return '';
      return String(str).toLowerCase()
        .replace(/\s*(road|suburban|terminus|junction|west|east|rd|jn)\b/gi, '')
        .replace(/[^a-z0-9]/g, '');
    }

    // Determine corridor
    let corridor = CORRIDOR_WESTERN;
    if (lineName.includes('harbour') || norm(origName).includes('panvel') || norm(destName).includes('panvel')) {
      corridor = CORRIDOR_HARBOUR;
    } else if (lineName.includes('central') || norm(origName).includes('kalyan') || norm(destName).includes('kalyan') || norm(origName).includes('thane') || norm(destName).includes('thane')) {
      corridor = CORRIDOR_CENTRAL;
    }

    let oIdx = corridor.findIndex(s => norm(s.name) === norm(origName) || (s.code && norm(s.code) === norm(origName)));
    let dIdx = corridor.findIndex(s => norm(s.name) === norm(destName) || (s.code && norm(s.code) === norm(destName)));

    if (oIdx === -1 && Array.isArray(apiStops) && apiStops.length > 0) {
      const firstApiName = apiStops[0].stationName || apiStops[0].station_name || '';
      oIdx = corridor.findIndex(s => norm(s.name) === norm(firstApiName));
    }
    if (dIdx === -1 && Array.isArray(apiStops) && apiStops.length > 0) {
      const lastApiName = apiStops[apiStops.length - 1].stationName || apiStops[apiStops.length - 1].station_name || '';
      dIdx = corridor.findIndex(s => norm(s.name) === norm(lastApiName));
    }

    if (oIdx === -1) oIdx = 0;
    if (dIdx === -1) dIdx = corridor.length - 1;

    let sliced = (oIdx <= dIdx) 
      ? corridor.slice(oIdx, dIdx + 1)
      : corridor.slice(dIdx, oIdx + 1).reverse();

    if (sliced.length === 0) {
      sliced = corridor.slice(0, 15);
    }

    const rawTime = trainItem.departureTime || trainItem.fromStop?.departure_time || '05:45:00';
    let baseStartMin = parseTimeToMinutes(rawTime);

    // Fast train stopping stations on major corridors
    const wrFastMajor = ['CCG', 'MMCT', 'DDR', 'BA', 'ADH', 'BVI', 'BYR', 'BSR', 'VR', 'PLG', 'BOR', 'DRD'];
    const crFastMajor = ['CSMT', 'BY', 'DR', 'CLA', 'GC', 'BND', 'MLND', 'TNA', 'DI', 'KYN'];

    const hasApiStops = Array.isArray(apiStops) && apiStops.length > 0;

    // First pass: match stations & flag doesStop
    const result = sliced.map((cStn, idx) => {
      let matchedApi = null;
      if (hasApiStops) {
        matchedApi = apiStops.find(a => {
          const aName = norm(a.stationName || a.station_name || '');
          const aCode = (a.stationCode || a.station_code || '').toUpperCase();
          return (aName && aName === norm(cStn.name)) || (aCode && aCode === cStn.code.toUpperCase());
        });
      }

      const isOrigin = idx === 0;
      const isDestination = idx === sliced.length - 1;

      let doesStop = true;
      if (hasApiStops) {
        doesStop = Boolean(matchedApi) || isOrigin || isDestination;
      } else if (isFast) {
        const isCorridorMajor = cStn.major || wrFastMajor.includes(cStn.code) || crFastMajor.includes(cStn.code);
        doesStop = isCorridorMajor || isOrigin || isDestination;
      }

      let depTime = matchedApi ? (matchedApi.departure_time || matchedApi.arrival_time) : null;
      let arrTime = matchedApi ? (matchedApi.arrival_time || matchedApi.departure_time) : null;
      let pf = matchedApi?.platform || null;

      return {
        sequence: idx + 1,
        stationName: cStn.name,
        stationCode: cStn.code,
        departure_time: depTime,
        arrival_time: arrTime,
        platform: pf,
        isOrigin,
        isDestination,
        doesStop,
        major: cStn.major
      };
    });

    // Ensure origin has start time
    if (!result[0].departure_time) {
      const hh = String(Math.floor(baseStartMin / 60)).padStart(2, '0');
      const mm = String(baseStartMin % 60).padStart(2, '0');
      result[0].departure_time = `${hh}:${mm}:00`;
      result[0].arrival_time = `${hh}:${mm}:00`;
    }

    // Second pass: interpolate missing departure_time for smooth transit
    for (let i = 0; i < result.length; i++) {
      if (!result[i].departure_time) {
        // Find previous known stop
        let prevIdx = i - 1;
        while (prevIdx >= 0 && !result[prevIdx].departure_time) prevIdx--;
        const prevMin = prevIdx >= 0 ? parseTimeToMinutes(result[prevIdx].departure_time) : baseStartMin;

        // Find next known stop
        let nextIdx = i + 1;
        while (nextIdx < result.length && !result[nextIdx].departure_time) nextIdx++;
        let nextMin = nextIdx < result.length 
          ? parseTimeToMinutes(result[nextIdx].departure_time) 
          : (prevMin + (result.length - prevIdx) * (isFast ? 4 : 3));

        if (nextMin < prevMin) nextMin += 1440; // overnight handling

        const gap = nextIdx - prevIdx;
        const step = (nextMin - prevMin) / (gap || 1);
        const interpMin = (Math.round(prevMin + step * (i - prevIdx))) % 1440;

        const hh = String(Math.floor(interpMin / 60)).padStart(2, '0');
        const mm = String(interpMin % 60).padStart(2, '0');
        result[i].departure_time = `${hh}:${mm}:00`;
        result[i].arrival_time = `${hh}:${mm}:00`;
      }
    }

    return result;
  }

  function generateFallbackStopsForTrain(trainItem) {
    return buildFullCorridorRouteStops(trainItem, []);
  }

  // Realistic Suburban Railway Platform Resolver for All Stations (Both Big & Small Stops)
  function getStopPlatform(stop, isMajor, isFast, trainItem, idx) {
    if (stop.platform) return String(stop.platform).padStart(2, '0');

    const sName = (stop.stationName || stop.station_name || '').toLowerCase();
    const isUp = (trainItem.route?.direction === 'UP') || 
                 (trainItem.destinationStation?.normalized_name?.includes('churchgate') || 
                  trainItem.destinationStation?.normalized_name?.includes('csmt'));

    // Major stations platform defaults
    if (sName.includes('churchgate')) return isFast ? '03' : '02';
    if (sName.includes('dadar')) return isFast ? '04' : (isUp ? '01' : '03');
    if (sName.includes('andheri')) return isFast ? '05' : (isUp ? '02' : '03');
    if (sName.includes('borivali')) return isFast ? '06' : (isUp ? '03' : '04');
    if (sName.includes('virar')) return isFast ? '03' : '02';
    if (sName.includes('mumbai central')) return isFast ? '03' : '02';
    if (sName.includes('bandra')) return isFast ? '04' : '02';
    if (sName.includes('bhayandar')) return isFast ? '05' : '03';
    if (sName.includes('vasai road')) return isFast ? '04' : '02';

    // Small / Intermediate local stations (User requested: "3. Show platform's number for small stops also")
    if (isUp) {
      return (sName.includes('marine lines') || sName.includes('charni')) ? '01' : '01';
    } else {
      return (sName.includes('prabhadevi') || sName.includes('marine lines')) ? '01' : '02';
    }
  }

  // ==========================================================================
  // TRAIN CAPSULE LIVE ARRIVAL & IN-BETWEEN TRANSIT ENGINE
  // ==========================================================================
  let lastJourneyLiveKey = null;

  // Calculates exact live train position:
  // 1. AT_STATION (Green Capsule + 'Arrived here')
  // 2. BETWEEN (Orange Capsule + 'Between' centered between two stations)
  function calculateTrainLivePosition(stops, trainItem) {
    if (!stops || stops.length === 0) {
      return {
        mode: 'AT_STATION',
        stationIdx: 0,
        fromIdx: 0,
        toIdx: 0,
        statusTag: 'TRAIN AT ORIGIN',
        notStarted: true,
        isCompleted: false,
        delayMinutes: 0
      };
    }

    const totalStops = stops.length;
    const d = getMumbaiLiveDate();
    const currentMinutes = d.getHours() * 60 + d.getMinutes();
    const currentSeconds = d.getSeconds();
    const delayMinutes = CrowdLiveEngine.getTrainDelay(trainItem);
    // If train is delayed, its physical location along the timetable schedule is behind by delayMinutes
    const effectiveMinutes = (currentMinutes - delayMinutes + 1440) % 1440;

    const stopMinutes = stops.map(s => parseTimeToMinutes(s.departure_time || s.arrival_time || '00:00:00'));
    const originMinutes = stopMinutes[0];
    const terminusMinutes = stopMinutes[totalStops - 1];

    const totalJourneyDuration = (terminusMinutes - originMinutes + 1440) % 1440;
    const diffOrigin = getTimeDifferenceMinutes(originMinutes, effectiveMinutes);

    // 1. Train has not departed origin yet
    if (diffOrigin > 0) {
      let tag = 'TRAIN AT ORIGIN';
      if (diffOrigin === 1) tag = 'DEPARTS IN 1M';
      else if (diffOrigin <= 60) tag = `DEPARTS IN ${diffOrigin}M`;
      return {
        mode: 'AT_STATION',
        stationIdx: 0,
        fromIdx: 0,
        toIdx: 1,
        statusTag: tag,
        notStarted: true,
        isCompleted: false,
        delayMinutes
      };
    }

    // 2. Train has departed: elapsed time along the journey
    const elapsedMinutes = (effectiveMinutes - originMinutes + 1440) % 1440;

    // 3. Train reached destination
    if (elapsedMinutes >= totalJourneyDuration) {
      return {
        mode: 'AT_STATION',
        stationIdx: totalStops - 1,
        fromIdx: totalStops - 2,
        toIdx: totalStops - 1,
        statusTag: 'TERMINUS REACHED',
        notStarted: false,
        isCompleted: true,
        delayMinutes
      };
    }

    const elapsedTotalSeconds = elapsedMinutes * 60 + currentSeconds;

    // 4. In transit along route: CONTINUOUS SMOOTH MOVEMENT (No 15-20s stop, smooth color morphing)
    for (let i = 0; i < totalStops - 1; i++) {
      const sElapsed = (stopMinutes[i] - originMinutes + 1440) % 1440;
      const nextElapsed = (stopMinutes[i + 1] - originMinutes + 1440) % 1440;

      const sSec = sElapsed * 60;
      const nextSec = nextElapsed * 60;

      if (elapsedTotalSeconds >= sSec && elapsedTotalSeconds < nextSec) {
        const transitDuration = Math.max(10, nextSec - sSec);
        const elapsedTransit = elapsedTotalSeconds - sSec;
        const rawProgress = Math.max(0, Math.min(1, elapsedTransit / transitDuration));

        // Touching dot threshold:
        // When at/leaving station i (rawProgress <= 0.05) -> touching station i dot (GREEN)
        // When reaching/touching station i + 1 (rawProgress >= 0.95) -> touching station i + 1 dot (GREEN)
        // In-between (0.05 < rawProgress < 0.95) -> smoothly gliding along the track (ORANGE)
        const isTouchingDot = (rawProgress <= 0.05) || (rawProgress >= 0.95);
        const activeStationIdx = (rawProgress >= 0.95) ? (i + 1) : i;

        return {
          mode: 'BETWEEN',
          stationIdx: activeStationIdx,
          fromIdx: i,
          toIdx: i + 1,
          statusTag: isTouchingDot ? 'AT_STOP' : 'BETWEEN',
          notStarted: false,
          isCompleted: false,
          delayMinutes,
          progress: rawProgress,
          isTouchingDot
        };
      }
    }

    // Fallback to terminus
    return {
      mode: 'BETWEEN',
      stationIdx: totalStops - 1,
      fromIdx: Math.max(0, totalStops - 2),
      toIdx: totalStops - 1,
      statusTag: 'ARRIVED HERE',
      notStarted: false,
      isCompleted: true,
      delayMinutes,
      progress: 1.0,
      isTouchingDot: true
    };
  }

  // Compatibility wrapper
  function calculateCurrentStopByTime(stops, trainItem) {
    const pos = calculateTrainLivePosition(stops, trainItem);
    return {
      currentStopIdx: pos.stationIdx,
      statusTag: pos.statusTag,
      notStarted: pos.notStarted,
      isCompleted: pos.isCompleted,
      delayMinutes: pos.delayMinutes,
      mode: pos.mode,
      fromIdx: pos.fromIdx,
      toIdx: pos.toIdx
    };
  }

  function renderJourneyStopsList(stops, livePos, trainItem, shouldScroll = true) {
    const stopsContainer = document.getElementById('journeyStopsContainer');
    if (!stopsContainer) return;

    if (!stops || stops.length === 0) {
      stopsContainer.innerHTML = `
        <div class="journey-loading-box">
          <div>No route stops available for this train.</div>
        </div>
      `;
      return;
    }

    const total = stops.length;
    const isFast = isTrainFast(trainItem);
    const delayMinutes = CrowdLiveEngine.getTrainDelay(trainItem);

    let html = '';

    for (let idx = 0; idx < total; idx++) {
      const stop = stops[idx];
      const isOrigin = (idx === 0) || stop.isOrigin;
      const isDest = (idx === total - 1) || stop.isDestination;
      const sName = (stop.stationName || stop.station_name || 'Station').replace(' Road', '').replace(' Suburban', '');
      const sCode = stop.stationCode || stop.station_code || '';
      const isMajor = isMajorStation(sName, sCode, isOrigin, isDest);

      const isSkip = (stop.doesStop === false);

      // 12-hour AM/PM Estimated Reach Time & Scheduled Time
      const stopRaw = stop.departure_time || stop.arrival_time || '05:45:00';
      const stopSec = parseTimeToSeconds(stopRaw);
      const estReachSec = (stopSec + delayMinutes * 60) % 86400;
      const estHh = Math.floor(estReachSec / 3600);
      const estMm = Math.floor((estReachSec % 3600) / 60);
      const estRaw = `${String(estHh).padStart(2, '0')}:${String(estMm).padStart(2, '0')}:00`;
      const stopTime = formatTime12(delayMinutes > 0 ? estRaw : stopRaw);
      const schedTime = formatTime12(stopRaw);

      // Platform: populated for stops
      const pfStr = getStopPlatform(stop, isMajor, isFast, trainItem, idx);

      html += `
        <div class="journey-stop-row ${isMajor ? 'is-major' : 'is-minor'} ${isSkip ? 'is-skip-station' : ''}" id="journey-stop-${idx}" data-stop-idx="${idx}">
          <div class="stop-time">
            <span class="stop-time-val ${isSkip ? 'is-skipped' : ''}">${stopTime.hhmm}</span>
            <span class="stop-time-ampm ${isSkip ? 'is-skipped' : ''}">${stopTime.ampm}</span>
            ${(!isSkip && delayMinutes > 0) ? `<span class="stop-delay-badge" title="Scheduled ${schedTime.hhmm}">+${delayMinutes}m</span>` : ''}
          </div>

          <div class="stop-track">
            ${idx === 0 ? `
              <div class="stop-track-line line-bottom"></div>
            ` : idx === total - 1 ? `
              <div class="stop-track-line line-top"></div>
            ` : `
              <div class="stop-track-line line-full"></div>
            `}
            <div class="stop-dot-anchor">
              <div class="stop-dot ${isSkip ? 'is-skip-dot' : 'is-halt-dot'}" id="journey-dot-${idx}">
                ${!isSkip ? `
                  <svg class="stop-dot-check-icon" width="8.2" height="8.2" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ` : ''}
              </div>
            </div>
          </div>

          <div class="stop-content">
            <div class="stop-station-col">
              <span class="stop-station-name ${isSkip ? 'is-skip-text' : 'is-halt-text'}">${isSkip ? `<svg class="stop-skip-cross-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"></circle><line x1="5.28" y1="5.28" x2="18.72" y2="18.72"></line></svg>` : ''}<span class="stop-name-text">${sName}</span></span>
            </div>
            <div class="stop-meta-right">
              ${!isSkip && pfStr ? `<span class="stop-pf-badge">PF: ${pfStr}</span>` : ''}
            </div>
          </div>
        </div>
      `;

      // Persistent in-between track connecting stop idx to stop idx + 1
      if (idx < total - 1) {
        html += `
          <div class="journey-between-row" id="journey-between-${idx}">
            <div class="between-time-spacer"></div>
            <div class="between-track">
              <div class="between-track-line" id="between-line-${idx}"></div>
            </div>
            <div class="between-content">
              <span class="between-text" id="between-text-${idx}">Between</span>
            </div>
          </div>
        `;
      }
    }

    // Return button rendered at the very end of stops timeline (visible when user scrolls to bottom)
    html += `
      <div class="journey-end-return-box">
        <button id="btnJourneyReturn" class="btn-journey-return" title="Return">
          <span>Return</span>
        </button>
      </div>
    `;

    // Single persistent moving capsule along the entire route track
    html += `
      <div class="train-capsule-orange is-orange is-moving" id="journeyLiveCapsule">
        <div class="capsule-layer capsule-layer-orange"></div>
        <div class="capsule-layer capsule-layer-green"></div>
        <div class="capsule-inside-beam"></div>
      </div>
    `;

    stopsContainer.innerHTML = html;

    // Attach click listener for Return button rendered inside stops container
    stopsContainer.querySelector('#btnJourneyReturn')?.addEventListener('click', () => {
      showToast('Return button clicked');
    });

    // Immediately calculate dynamic dot offset synchronously so capsule lands precisely without initial jerk
    refreshJourneyCurrentStop(shouldScroll, true);
  }

  function updateJourneyCrowdBadge() {
    const titleEl = document.getElementById('journeySubbarTitle');
    const chip = document.getElementById('journeyCrowdChip');
    const toggle = document.getElementById('toggleInTrain');
    if (!activeJourneyTrain) return;

    const isUserInside = CrowdLiveEngine.isUserInTrain(activeJourneyTrain);
    const delayMinutes = CrowdLiveEngine.getTrainDelay(activeJourneyTrain);

    if (toggle) {
      toggle.checked = isUserInside;
    }

    if (titleEl) {
      titleEl.textContent = isUserInside ? 'Thank you for your Feedback' : 'You are currently in this train ?';
    }

    if (isUserInside || delayMinutes > 0) {
      if (chip) {
        chip.style.display = 'inline-flex';
        const textEl = chip.querySelector('.crowd-beacon-text');
        if (textEl) {
          textEl.textContent = `Late by ${delayMinutes || 15}m shared`;
        }
      }
    } else {
      if (chip) chip.style.display = 'none';
    }
  }

  function refreshJourneyCurrentStop(shouldScroll = false, isInitial = false) {
    if (!currentJourneyStops || currentJourneyStops.length === 0 || !activeJourneyTrain) return;
    const stopsContainer = document.getElementById('journeyStopsContainer');
    if (!stopsContainer) return;

    const liveCapsule = document.getElementById('journeyLiveCapsule');
    if (!liveCapsule) {
      const livePos = calculateTrainLivePosition(currentJourneyStops, activeJourneyTrain);
      renderJourneyStopsList(currentJourneyStops, livePos, activeJourneyTrain, shouldScroll);
      return;
    }

    const livePos = calculateTrainLivePosition(currentJourneyStops, activeJourneyTrain);
    const total = currentJourneyStops.length;
    const isDay = document.body.classList.contains('theme-day');
    const purpleColor = isDay ? '#9333EA' : '#A855F7';
    const grayColor = isDay ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.22)';

    const stopFromEl = document.getElementById(`journey-stop-${livePos.fromIdx}`);
    const stopToEl = document.getElementById(`journey-stop-${livePos.toIdx}`);
    if (!stopFromEl || !stopToEl) return;

    // 1. Calculate dead-center X on the track line dynamically relative to stopsContainer
    const anchorEl = stopFromEl.querySelector('.stop-dot-anchor') || stopFromEl.querySelector('.stop-track');
    if (anchorEl) {
      const contRect = stopsContainer.getBoundingClientRect();
      const anchorRect = anchorEl.getBoundingClientRect();
      const exactTrackX = (anchorRect.left + (anchorRect.width / 2)) - contRect.left + stopsContainer.scrollLeft;
      liveCapsule.style.left = `${exactTrackX.toFixed(1)}px`;
    }

    // 2. Measure vertical dot centers
    const contRect = stopsContainer.getBoundingClientRect();
    const anchorFrom = stopFromEl.querySelector('.stop-dot-anchor') || stopFromEl.querySelector('.stop-dot');
    const anchorTo = stopToEl.querySelector('.stop-dot-anchor') || stopToEl.querySelector('.stop-dot');

    const fromRect = anchorFrom.getBoundingClientRect();
    const toRect = anchorTo.getBoundingClientRect();

    const fromDotY = (fromRect.top + fromRect.height / 2) - contRect.top + stopsContainer.scrollTop;
    const toDotY = (toRect.top + toRect.height / 2) - contRect.top + stopsContainer.scrollTop;

    const progress = Math.max(0, Math.min(1, livePos.progress !== undefined ? livePos.progress : 0));
    const currentY = fromDotY + progress * (toDotY - fromDotY);

    // 3. Smooth time-based positioning with ZERO jumps
    if (isInitial) {
      liveCapsule.style.transition = 'none';
      liveCapsule.style.top = `${currentY.toFixed(1)}px`;
      void liveCapsule.offsetHeight; // force layout reflow
      liveCapsule.style.transition = 'top 1s linear, box-shadow 0.65s cubic-bezier(0.4, 0, 0.2, 1)';
    } else {
      liveCapsule.style.top = `${currentY.toFixed(1)}px`;
    }

    // 4. Dot Touching Logic (Strictly based on distance/time, no pause/holding time):
    // CRITICAL USER REQUIREMENT 2:
    // When train is passing a station where it does NOT stop (doesStop === false):
    // The capsule MUST NOT become green, it will REMAIN ORANGE.
    // The capsule will ONLY become green when the train has a scheduled stop at that station.
    const distFrom = Math.abs(currentY - fromDotY);
    const distTo = Math.abs(currentY - toDotY);
    const isTouchingDot = (distFrom <= 9) || (distTo <= 9) || livePos.notStarted || livePos.isCompleted;
    const activeDotStationIdx = (distTo <= 9) ? livePos.toIdx : livePos.fromIdx;
    const activeStation = currentJourneyStops[activeDotStationIdx];

    const isStationScheduledStop = Boolean(activeStation && activeStation.doesStop !== false);
    const shouldCapsuleBeGreen = Boolean(isTouchingDot && isStationScheduledStop);

    liveCapsule.classList.toggle('is-green', shouldCapsuleBeGreen);
    liveCapsule.classList.toggle('is-orange', !shouldCapsuleBeGreen);

    // Uncompleted route track: simple thin gray line with 70% opacity
    const uncompletedGray = isDay ? 'rgba(100, 116, 139, 0.70)' : 'rgba(148, 163, 184, 0.70)';

    // 5. Update Station Rows (Passed, Arrived here, Touched, Track Line Completed/Thin Gray)
    for (let idx = 0; idx < total; idx++) {
      const row = document.getElementById(`journey-stop-${idx}`);
      if (!row) continue;
      const dot = row.querySelector('.stop-dot');
      const stnCol = row.querySelector('.stop-station-col');
      const stopData = currentJourneyStops[idx];
      const doesThisStop = Boolean(stopData && stopData.doesStop !== false);

      const isThisTouched = Boolean(isTouchingDot && activeDotStationIdx === idx && doesThisStop);
      const isPassed = (idx < livePos.fromIdx) || (idx === livePos.fromIdx && !isThisTouched);

      row.classList.toggle('is-passed', isPassed);
      row.classList.toggle('is-current', isThisTouched);
      if (dot) {
        if (doesThisStop) {
          dot.classList.toggle('is-touched', isThisTouched);
        } else {
          dot.classList.remove('is-touched');
        }
      }

      const stnNameEl = row.querySelector('.stop-station-name');
      const stnNameText = row.querySelector('.stop-name-text');
      if (stnNameEl) stnNameEl.classList.toggle('is-current-station', isThisTouched);
      if (stnNameText) stnNameText.classList.toggle('is-current-station', isThisTouched);

      if (stnCol) {
        let arrivedEl = stnCol.querySelector('.stop-arrived-text');
        if (isThisTouched) {
          if (!arrivedEl) {
            arrivedEl = document.createElement('span');
            arrivedEl.className = 'stop-arrived-text';
            arrivedEl.textContent = 'Arrived here';
            stnCol.appendChild(arrivedEl);
          }
        } else if (arrivedEl) {
          arrivedEl.remove();
        }
      }

      // Station Track Line: Completed behind capsule = Solid Vibrant Purple without breaks; Ahead = Thin Gray 70% opacity only
      const lineEl = row.querySelector('.stop-track-line');
      if (lineEl) {
        let segStart = row.offsetTop;
        let segEnd = segStart + row.offsetHeight;
        if (idx === 0) {
          segStart = row.offsetTop + (row.offsetHeight / 2);
        } else if (idx === total - 1) {
          segEnd = row.offsetTop + (row.offsetHeight / 2);
        }

        if (currentY >= segEnd) {
          // Strictly behind capsule: Full Solid Vibrant Purple without break
          lineEl.classList.add('is-completed-track');
          lineEl.style.background = '';
          lineEl.style.boxShadow = '';
        } else if (currentY <= segStart) {
          // Strictly ahead of capsule: Thin Gray 70% opacity only
          lineEl.classList.remove('is-completed-track');
          lineEl.style.background = '';
          lineEl.style.boxShadow = 'none';
        } else {
          // Capsule is spanning this station row
          lineEl.classList.remove('is-completed-track');
          const fillPx = Math.max(0, currentY - segStart);
          lineEl.style.background = `linear-gradient(180deg, ${purpleColor} 0px, ${purpleColor} ${fillPx.toFixed(1)}px, ${uncompletedGray} ${fillPx.toFixed(1)}px, ${uncompletedGray} 100%)`;
          lineEl.style.boxShadow = (!isDay && fillPx > 3) ? '0 0 8px rgba(168, 85, 247, 0.75)' : 'none';
        }
      }
    }

    // 6. Update Between Rows (Completed behind capsule: Solid Vibrant Purple without break; Ahead: Thin Gray 70% opacity only)
    for (let idx = 0; idx < total - 1; idx++) {
      const bRow = document.getElementById(`journey-between-${idx}`);
      const bLine = document.getElementById(`between-line-${idx}`);
      const bText = document.getElementById(`between-text-${idx}`);

      if (bRow && bLine) {
        const segStart = bRow.offsetTop;
        const segEnd = segStart + bRow.offsetHeight;

        if (currentY >= segEnd) {
          // Strictly behind capsule: Full Solid Vibrant Purple without break
          bLine.classList.add('is-completed-track');
          bLine.style.background = '';
          bLine.style.boxShadow = '';
        } else if (currentY <= segStart) {
          // Strictly ahead of capsule: Thin Gray 70% opacity only
          bLine.classList.remove('is-completed-track');
          bLine.style.background = '';
          bLine.style.boxShadow = 'none';
        } else {
          // Capsule is spanning this between row
          bLine.classList.remove('is-completed-track');
          const fillPx = Math.max(0, currentY - segStart);
          bLine.style.background = `linear-gradient(180deg, ${purpleColor} 0px, ${purpleColor} ${fillPx.toFixed(1)}px, ${uncompletedGray} ${fillPx.toFixed(1)}px, ${uncompletedGray} 100%)`;
          bLine.style.boxShadow = (!isDay && fillPx > 3) ? '0 0 8px rgba(168, 85, 247, 0.75)' : 'none';
        }
      }

      if (bText) {
        bText.style.display = (idx === livePos.fromIdx && !isTouchingDot) ? 'block' : 'none';
      }
    }

    // 7. Stops Notification Engine Integration
    if (window.stopsNotifEngine) {
      if (isTouchingDot) {
        const curr = currentJourneyStops[activeDotStationIdx]?.station?.station_name || currentJourneyStops[activeDotStationIdx]?.station_name || 'Station';
        const prev = (activeDotStationIdx > 0) ? (currentJourneyStops[activeDotStationIdx - 1]?.station?.station_name || currentJourneyStops[activeDotStationIdx - 1]?.station_name) : '';
        const next = (activeDotStationIdx < currentJourneyStops.length - 1) ? (currentJourneyStops[activeDotStationIdx + 1]?.station?.station_name || currentJourneyStops[activeDotStationIdx + 1]?.station_name) : '';
        window.stopsNotifEngine.onArrived(curr, prev, next);
      } else {
        const prev = currentJourneyStops[livePos.fromIdx]?.station?.station_name || currentJourneyStops[livePos.fromIdx]?.station_name || '';
        const curr = currentJourneyStops[livePos.fromIdx]?.station?.station_name || currentJourneyStops[livePos.fromIdx]?.station_name || '';
        const next = currentJourneyStops[livePos.toIdx]?.station?.station_name || currentJourneyStops[livePos.toIdx]?.station_name || '';
        window.stopsNotifEngine.onInBetween(prev, curr, next);
      }
    }

    // 8. Auto-centering / Scrolling
    if (shouldScroll) {
      setTimeout(() => {
        if (stopsContainer) {
          stopsContainer.scrollTo({
            top: Math.max(0, currentY - Math.round(stopsContainer.clientHeight / 2)),
            behavior: 'smooth'
          });
        }
      }, 80);
    }
    // Allow user to freely scroll anywhere from top to bottom without forced auto-jumps!
    // Dynamically update Reset button visibility
    updateJourneyResetButtonVisibility();
  }

  function updateJourneyResetButtonVisibility() {
    const resetBtn = document.getElementById('btnJourneyReset');
    const stopsContainer = document.getElementById('journeyStopsContainer');
    const liveCapsule = document.getElementById('journeyLiveCapsule');
    if (!resetBtn || !stopsContainer) return;

    if (!liveCapsule) {
      resetBtn.classList.remove('visible');
      return;
    }

    const capsuleTop = parseFloat(liveCapsule.style.top) || 0;
    const viewTop = stopsContainer.scrollTop;
    const viewBottom = viewTop + stopsContainer.clientHeight;

    // Capsule is considered visible if it is comfortably inside the scroll window
    const isCapsuleVisible = (capsuleTop >= viewTop + 30) && (capsuleTop <= viewBottom - 30);

    resetBtn.classList.toggle('visible', !isCapsuleVisible);
  }

  function onCrowdReportsUpdated() {
    // 1. Re-render timetable tiles so "Late by 15 mnts" shows on results screen
    const resultsScreen = document.getElementById('screen-train-results');
    if (resultsScreen && resultsScreen.classList.contains('active')) {
      renderTimetableTiles(getFilteredTrains(), false);
    }

    // 2. If viewing a train journey screen, update live badge & stops timeline
    const journeyScreen = document.getElementById('screen-train-journey');
    if (journeyScreen && journeyScreen.classList.contains('active') && activeJourneyTrain) {
      updateJourneyCrowdBadge();
      refreshJourneyCurrentStop(false);
    }
  }

  async function openTrainJourneyScreen(trainItem, trainIdx) {
    if (!trainItem) return;

    activeJourneyTrain = trainItem;
    activeJourneyTrainIdx = trainIdx;

    showScreen('screen-train-journey');

    const isFast = isTrainFast(trainItem);
    const isAc = isTrainAc(trainItem);
    const tNum = trainItem.train?.train_number || '';
    const rawTime = trainItem.departureTime || trainItem.fromStop?.departure_time || '05:45:00';
    const { hhmm, ampm } = formatTime12(rawTime);

    let originName = trainItem.originStation?.station_name || 'Churchgate';
    let termName = trainItem.destinationStation?.station_name || 'Virar';
    originName = originName.replace(' Road', '').replace(' Suburban', '');
    termName = termName.replace(' Road', '').replace(' Suburban', '');

    // 1. Header Train Name (Center) with simple white arrow
    const trainNameEl = document.getElementById('journeyTrainName');
    if (trainNameEl) {
      trainNameEl.innerHTML = `<span>${originName}</span><span class="route-arrow"><svg class="header-route-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12"></line><polyline points="13 5 20 12 13 19"></polyline></svg></span><span>${termName}</span>`;
    }

    // 2. Header Train Meta
    const trainMetaEl = document.getElementById('journeyTrainMeta');
    if (trainMetaEl) {
      const typeStr = isAc ? 'AC Local' : isFast ? 'Fast' : 'Slow';
      const carsStr = trainItem.train?.cars ? `${trainItem.train.cars} Cars` : '12 Cars';
      const numStr = tNum ? `#${tNum}` : '';
      trainMetaEl.textContent = `${hhmm} ${ampm} • ${typeStr} • ${carsStr} ${numStr}`.trim();
    }

    // 3. Header Speed Pill (Right)
    const typePillEl = document.getElementById('journeyTypePill');
    if (typePillEl) {
      if (isAc) {
        typePillEl.textContent = 'AC';
        typePillEl.className = 'journey-type-pill pill-ac';
      } else if (isFast) {
        typePillEl.textContent = 'FAST';
        typePillEl.className = 'journey-type-pill';
      } else {
        typePillEl.textContent = 'SLOW';
        typePillEl.className = 'journey-type-pill pill-slow';
      }
    }

    // 4. Update "You are currently in this train ?" toggle and live crowd chip
    updateJourneyCrowdBadge();

    // 5. Loading skeleton
    const stopsContainer = document.getElementById('journeyStopsContainer');
    if (stopsContainer) {
      stopsContainer.innerHTML = `
        <div class="journey-loading-box">
          <div class="journey-loading-spinner"></div>
          <div>Loading all stops...</div>
        </div>
      `;
    }

    // 6. Fetch stops from API
    let stops = [];
    const trainId = trainItem.train?.id;

    if (trainId) {
      try {
        const res = await fetch(`/api/routes?trainId=${encodeURIComponent(trainId)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.stops) && data.stops.length > 0) {
            stops = data.stops;
          }
        }
      } catch (e) {
        console.error('Failed to fetch route stops:', e);
      }
    }

    // Build the complete corridor stops list, marking skipped stops accordingly
    stops = buildFullCorridorRouteStops(trainItem, stops);
    currentJourneyStops = stops;

    // 7. Calculate which stop train is currently on strictly by Time Arrival Logic
    const livePos = calculateTrainLivePosition(stops, trainItem);
    lastJourneyLiveKey = `${livePos.mode}_${livePos.stationIdx}_${livePos.fromIdx}_${livePos.delayMinutes}`;

    // 8. Render stops list and auto-scroll to current stop
    renderJourneyStopsList(stops, livePos, trainItem, true);
  }

  // Event Listeners for Screen 6
  document.getElementById('btnBackFromJourney')?.addEventListener('click', () => {
    showScreen('screen-train-results');
  });

  document.getElementById('btnJourneyReturn')?.addEventListener('click', () => {
    // User requested: "in bottom show one button called Return (just keep that button as of now and i'll let you know the logic of it afterword)"
    showToast('Return button clicked');
  });

  // Small Glassmorphic Reset Button: Smoothly returns user to the live train capsule position
  document.getElementById('btnJourneyReset')?.addEventListener('click', () => {
    const stopsContainer = document.getElementById('journeyStopsContainer');
    const liveCapsule = document.getElementById('journeyLiveCapsule');
    if (stopsContainer && liveCapsule) {
      const capsuleTop = parseFloat(liveCapsule.style.top) || 0;
      stopsContainer.scrollTo({
        top: Math.max(0, capsuleTop - Math.round(stopsContainer.clientHeight / 2)),
        behavior: 'smooth'
      });
    }
  });

  // Track user scroll position in stops container to toggle Reset button visibility
  const journeyStopsScrollContainer = document.getElementById('journeyStopsContainer');
  if (journeyStopsScrollContainer) {
    journeyStopsScrollContainer.addEventListener('scroll', () => {
      updateJourneyResetButtonVisibility();
    }, { passive: true });
  }

  document.getElementById('toggleInTrain')?.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    if (!activeJourneyTrain) return;

    // Phase 1 + Phase 2: Report user presence in train & broadcast delay (default 15m)
    await CrowdLiveEngine.setTrainInReport(activeJourneyTrain, isChecked, 15, currentJourneyStops);
    updateJourneyCrowdBadge();

    if (isChecked) {
      showToast('Thank you for your Feedback! Live late info shared', 3500);
    } else {
      showToast('📍 Live train tracking disabled. Reverted to On Time.', 2500);
    }

    // Refresh current stop position using updated delay/on-time status
    refreshJourneyCurrentStop(true);

    // Re-render timetable tiles so other users/screens see the late information!
    renderTimetableTiles(getFilteredTrains(), false);
  });

  // ==========================================
  // 8. FLOATING OVERLAY SCROLLBAR CONTROLLER
  // ==========================================
  const overlayThumb = document.getElementById('customScrollThumb');
  let scrollFadeTimer = null;

  function syncScrollIndicator(element) {
    if (!overlayThumb || !element) return;
    const { scrollTop, scrollHeight, clientHeight } = element;
    if (scrollHeight <= clientHeight + 4) {
      overlayThumb.style.opacity = '0';
      return;
    }

    const availableTrack = clientHeight - 28;
    const thumbHeight = Math.max(30, (clientHeight / scrollHeight) * availableTrack);
    const scrollPercent = scrollTop / (scrollHeight - clientHeight);
    const thumbOffset = scrollPercent * (availableTrack - thumbHeight);

    overlayThumb.style.height = `${thumbHeight}px`;
    overlayThumb.style.transform = `translateY(${thumbOffset}px)`;
    overlayThumb.style.opacity = '1';

    clearTimeout(scrollFadeTimer);
    scrollFadeTimer = setTimeout(() => {
      overlayThumb.style.opacity = '0';
    }, 850);
  }

  // Attach listener to all scrollable app screens and station list
  document.querySelectorAll('.app-screen').forEach(scr => {
    scr.addEventListener('scroll', () => syncScrollIndicator(scr));
  });

  const stnDirList = document.getElementById('stationDirectoryList');
  if (stnDirList) {
    stnDirList.addEventListener('scroll', () => syncScrollIndicator(stnDirList));
  }

  const timetableContainer = document.getElementById('timetableTilesContainer');
  const timetableFilterBar = document.getElementById('timetableFilterBar');
  let lastTimetableScrollTop = 0;

  if (timetableContainer) {
    timetableContainer.addEventListener('scroll', () => {
      syncScrollIndicator(timetableContainer);

      if (!timetableFilterBar) return;

      const currentScrollTop = timetableContainer.scrollTop;

      // Ignore negative rubber-band bounce
      if (currentScrollTop < 0) return;

      // At top of timetable list (first ~10px), keep default SHOWN
      if (currentScrollTop <= 10) {
        timetableFilterBar.classList.remove('is-scrolled-hidden');
        lastTimetableScrollTop = currentScrollTop;
        return;
      }

      const delta = currentScrollTop - lastTimetableScrollTop;

      // Filter micro-jitter (movement must be >= 6px)
      if (Math.abs(delta) >= 6) {
        if (delta > 0) {
          // User scrolls DOWN (towards later trains) -> show again smoothly
          timetableFilterBar.classList.remove('is-scrolled-hidden');
        } else {
          // User scrolls to UP (towards earlier trains) -> hide smoothly
          timetableFilterBar.classList.add('is-scrolled-hidden');
        }
        lastTimetableScrollTop = currentScrollTop;
      }
    }, { passive: true });
  }

  // ==========================================================================
  // 9. STOPS NOTIFICATION SYSTEM & ANDROID SHUTTER GESTURES
  //    (Faithfully matching Phone 1, 2, 3, 4 mockups & Image 2 Train Line Logic)
  // ==========================================================================
  const StopsNotificationController = (() => {
    // DOM Elements
    const shutterShade = document.getElementById('androidShutterShade');
    const shadePullHandle = document.getElementById('shadePullHandle');
    const phoneStatusBar = document.getElementById('phoneStatusBar');
    const statusPullCue = document.getElementById('statusPullCue');
    const headerNotifPill = document.getElementById('headerNotifPill');
    const headerNotifText = document.getElementById('headerNotifText');
    const shutterNotifCard = document.getElementById('shutterNotifCard');
    const btnShutterNotifClose = document.getElementById('btnShutterNotifClose');
    const toggleStopsNotif = document.getElementById('toggleStopsNotification');
    const stopsNotifWrapper = document.getElementById('stopsNotifWrapper');
    const btnPrevArrived = document.getElementById('btnPreviewArrived');
    const btnPrevInbetween = document.getElementById('btnPreviewInbetween');
    const chkAllowAll = document.getElementById('chkNotifAllowAll');
    const chkHeader = document.getElementById('chkNotifHeader');
    const chkShutter = document.getElementById('chkNotifShutter');
    const chkVibrate = document.getElementById('chkNotifVibrate');

    // Comprehensive Mumbai Suburban Corridor Lines Architecture
    // Default active line is WR (Western Line) as specified, extensible for CR & HR
    const MUMBAI_CORRIDOR_LINES = {
      WR: {
        code: 'WR',
        name: 'WR • Western Line',
        color: '#2563EB',
        stations: [
          'Churchgate', 'Marine Lines', 'Charni Road', 'Grant Road', 'Mumbai Central',
          'Mahalaxmi', 'Lower Parel', 'Prabhadevi', 'Dadar', 'Matunga Rd.',
          'Mahim', 'Bandra', 'Khar Road', 'Santacruz', 'Vile Parle', 'Andheri',
          'Jogeshwari', 'Ram Mandir', 'Goregaon', 'Malad', 'Kandivali', 'Borivali',
          'Dahisar', 'Mira Road', 'Bhayandar', 'Naigaon', 'Vasai Road', 'Nallasopara',
          'Virar', 'Vaitarna', 'Saphale', 'Kelve Road', 'Palghar', 'Umroli', 'Boisar',
          'Vangaon', 'Dahanu Road'
        ]
      },
      CR: {
        code: 'CR',
        name: 'CR • Central Line',
        color: '#DC2626',
        stations: [
          'CSMT', 'Masjid', 'Sandhurst Road', 'Byculla', 'Chinchpokli', 'Currey Road',
          'Parel', 'Dadar', 'Matunga', 'Sion', 'Kurla', 'Vidyavihar', 'Ghatkopar',
          'Vikhroli', 'Kanjurmarg', 'Bhandup', 'Nahur', 'Mulund', 'Thane', 'Kalva',
          'Mumbra', 'Diva', 'Kopar', 'Dombivli', 'Thakurli', 'Kalyan'
        ]
      },
      HR: {
        code: 'HR',
        name: 'HR • Harbour Line',
        color: '#059669',
        stations: [
          'CSMT', 'Masjid', 'Sandhurst Road', 'Dockyard Road', 'Reay Road', 'Cotton Green',
          'Sewri', 'Vadala Road', 'GTB Nagar', 'Chunabhatti', 'Kurla', 'Tilak Nagar',
          'Chembur', 'Govandi', 'Mankhurd', 'Vashi', 'Sanpada', 'Juinagar', 'Nerul',
          'Seawoods', 'Belapur', 'Kharghar', 'Mansarovar', 'Khandeshwar', 'Panvel'
        ]
      }
    };

    let activeLineKey = 'WR';
    let currentStationIdx = 8; // Starts at Dadar (Prabhadevi -> Dadar -> Matunga Rd. as in mockups)
    let currentProgress = 0.0;  // 0.0 to 1.0 along active segment
    let transitElapsedSec = 0;
    const TRANSIT_DURATION_SEC = 150; // 2.5 minutes between stops
    const COLUMN_WIDTH = 120; // 120px spacing between stations
    const PADDING_OFFSET = 40; // 40px padding offset

    // State Variables
    let isShadeOpen = false;
    let isTrackingActive = false;
    let autoProgressTimer = null;
    let transitTimer = null;
    let pillTimer = null;
    let upcomingCycleTimer = null;
    let currentState = 'arrived'; // 'arrived' or 'inbetween'
    let isResetActive = false;
    let targetCapsuleScrollLeft = 0;
    let isProgrammaticScrolling = false;

    // Viewport Elements
    const shutterScrollViewport = document.getElementById('shutterScrollViewport');
    const shutterTimelineBaseTrack = document.getElementById('shutterTimelineBaseTrack');
    const shutterTimelineCompletedTrack = document.getElementById('shutterTimelineCompletedTrack');
    const shutterTimelineTrainCapsule = document.getElementById('shutterTimelineTrainCapsule');
    const shutterStationsStrip = document.getElementById('shutterStationsStrip');
    const shutterLineBadge = document.getElementById('shutterLineBadge');

    // ----------------------------------------------------
    // A. ANDROID SHUTTER GESTURES (DRAG DOWN & DRAG UP)
    // ----------------------------------------------------
    function openShutter() {
      if (!shutterShade) return;
      isShadeOpen = true;
      shutterShade.classList.remove('shade-dragging');
      shutterShade.classList.add('shade-open');
      shutterShade.style.transform = '';
      shutterShade.setAttribute('aria-hidden', 'false');

      // On open, ensure timeline is rendered and smoothly centered on current capsule
      requestAnimationFrame(() => {
        renderFullTimelineTrack();
        const remainingMin = currentState === 'inbetween' ? Math.max(0.1, (TRANSIT_DURATION_SEC - transitElapsedSec) / 60).toFixed(1) : null;
        updateTimelineDisplay(currentState, currentProgress, remainingMin);
        scrollToCapsule(false);
      });
    }

    function closeShutter() {
      if (!shutterShade) return;
      isShadeOpen = false;
      shutterShade.classList.remove('shade-dragging');
      shutterShade.classList.remove('shade-open');
      shutterShade.style.transform = '';
      shutterShade.setAttribute('aria-hidden', 'true');
    }

    function initShutterGestures() {
      if (!shutterShade) return;

      const viewport = document.querySelector('.phone-viewport');
      if (!viewport) return;

      let isDragging = false;
      let dragMode = ''; // 'down' (opening) or 'up' (closing)
      let startY = 0;
      let currentY = 0;
      let shadeHeight = 0;

      // 1. Drag Down to Open (from Status Bar, Notch, or top pull cue)
      function onTopPointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (isShadeOpen) return;

        isDragging = true;
        dragMode = 'down';
        startY = e.clientY;
        currentY = e.clientY;
        shadeHeight = viewport.clientHeight || 870;

        shutterShade.classList.add('shade-dragging');
        shutterShade.style.transform = `translateY(-${shadeHeight}px)`;

        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
      }

      // 2. Drag Up to Close (from bottom pull handle or shade bottom)
      function onBottomPointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (!isShadeOpen) return;

        isDragging = true;
        dragMode = 'up';
        startY = e.clientY;
        currentY = e.clientY;
        shadeHeight = viewport.clientHeight || 870;

        shutterShade.classList.add('shade-dragging');

        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
      }

      function onPointerMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        currentY = e.clientY;
        const deltaY = currentY - startY;

        if (dragMode === 'down') {
          // Pulling down from top: clamp between -shadeHeight and 0
          const offset = Math.min(0, Math.max(-shadeHeight, -shadeHeight + deltaY));
          shutterShade.style.transform = `translateY(${offset}px)`;
        } else if (dragMode === 'up') {
          // Pulling up from bottom: clamp between -shadeHeight and 0
          const offset = Math.min(0, Math.max(-shadeHeight, deltaY));
          shutterShade.style.transform = `translateY(${offset}px)`;
        }
      }

      function onPointerUp(e) {
        if (!isDragging) return;
        isDragging = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        shutterShade.classList.remove('shade-dragging');
        const deltaY = currentY - startY;

        if (dragMode === 'down') {
          // If pulled down > 55px or > 15% height, open!
          if (deltaY > 55) {
            openShutter();
          } else {
            closeShutter();
          }
        } else if (dragMode === 'up') {
          // If pulled up > 45px, close!
          if (deltaY < -45) {
            closeShutter();
          } else {
            openShutter();
          }
        }
      }

      // Attach down drag listeners to top area
      if (phoneStatusBar) {
        phoneStatusBar.addEventListener('pointerdown', onTopPointerDown);
        phoneStatusBar.addEventListener('click', (e) => {
          // If user clicks the status bar without dragging, toggle shutter smoothly
          if (!isDragging && Math.abs(currentY - startY) < 10) {
            if (!isShadeOpen) openShutter();
          }
        });
      }

      const phoneNotch = document.querySelector('.phone-notch');
      if (phoneNotch) {
        phoneNotch.addEventListener('pointerdown', onTopPointerDown);
      }

      // Attach up drag listeners to bottom handle
      if (shadePullHandle) {
        shadePullHandle.addEventListener('pointerdown', onBottomPointerDown);
        shadePullHandle.addEventListener('click', (e) => {
          e.stopPropagation();
          closeShutter();
        });
      }

      // Close shutter with ESC key
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isShadeOpen) {
          closeShutter();
        }
      });
    }

    // ----------------------------------------------------
    // B. HORIZONTAL LINE TRACK RENDERING & SMOOTH TIME MOVEMENT
    //    (Image 2 Train Line Logic & Smooth Continuous Movement)
    // ----------------------------------------------------
    function getActiveStations() {
      const lineData = MUMBAI_CORRIDOR_LINES[activeLineKey] || MUMBAI_CORRIDOR_LINES.WR;
      return lineData.stations;
    }

    function renderFullTimelineTrack() {
      const lineData = MUMBAI_CORRIDOR_LINES[activeLineKey] || MUMBAI_CORRIDOR_LINES.WR;
      const stations = lineData.stations;
      const numStations = stations.length;

      if (shutterLineBadge) {
        shutterLineBadge.textContent = lineData.name;
      }

      const totalTrackWidth = (numStations - 1) * COLUMN_WIDTH;
      const startX = PADDING_OFFSET + (COLUMN_WIDTH / 2);

      if (shutterTimelineBaseTrack) {
        shutterTimelineBaseTrack.style.left = `${startX}px`;
        shutterTimelineBaseTrack.style.width = `${totalTrackWidth}px`;
      }

      if (shutterTimelineCompletedTrack) {
        shutterTimelineCompletedTrack.style.left = `${startX}px`;
      }

      if (shutterStationsStrip) {
        shutterStationsStrip.innerHTML = stations.map((stnName, idx) => {
          return `
            <div class="shutter-timeline-col" data-idx="${idx}" id="shutterCol_${idx}">
              <span class="shutter-col-name">${stnName}</span>
              <div class="shutter-col-node"></div>
              <div class="shutter-col-subtext"></div>
            </div>
          `;
        }).join('');

        // Tap on any station to inspect it
        shutterStationsStrip.querySelectorAll('.shutter-timeline-col').forEach(col => {
          col.addEventListener('click', () => {
            const idx = parseInt(col.getAttribute('data-idx'), 10);
            const targetX = startX + idx * COLUMN_WIDTH;
            const viewportWidth = shutterScrollViewport ? shutterScrollViewport.clientWidth : 360;
            const scrollPos = Math.max(0, targetX - (viewportWidth / 2));
            shutterScrollViewport.scrollTo({ left: scrollPos, behavior: 'smooth' });
          });
        });
      }
    }

    function updateTimelineDisplay(state, progress = 0.0, etaMinutes = null) {
      if (!shutterNotifCard) return;
      shutterNotifCard.style.display = 'block';
      shutterNotifCard.style.opacity = '1';

      const stations = getActiveStations();
      const numStations = stations.length;
      const idx = Math.min(numStations - 1, Math.max(0, currentStationIdx));
      const nextIdx = Math.min(numStations - 1, idx + 1);

      const startX = PADDING_OFFSET + (COLUMN_WIDTH / 2);
      const nodeX_curr = startX + idx * COLUMN_WIDTH;
      const nodeX_next = startX + nextIdx * COLUMN_WIDTH;

      let capsuleX = nodeX_curr;
      if (state === 'inbetween') {
        capsuleX = nodeX_curr + progress * (nodeX_next - nodeX_curr);
      }

      // Update Train Capsule (Image 2 exact style)
      if (shutterTimelineTrainCapsule) {
        shutterTimelineTrainCapsule.style.left = `${capsuleX}px`;
        shutterTimelineTrainCapsule.style.opacity = '1';
      }

      // Update Completed Track Line (stretches to capsule)
      if (shutterTimelineCompletedTrack) {
        shutterTimelineCompletedTrack.style.width = `${Math.max(0, capsuleX - startX)}px`;
      }

      // Update Card State Class
      shutterNotifCard.classList.toggle('state-arrived', state === 'arrived');
      shutterNotifCard.classList.toggle('state-inbetween', state === 'inbetween');

      // Update Each Station Column's Node, Label, and Subtext
      for (let k = 0; k < numStations; k++) {
        const col = document.getElementById(`shutterCol_${k}`);
        if (!col) continue;

        const subtextEl = col.querySelector('.shutter-col-subtext');

        col.classList.remove('is-passed', 'is-current', 'is-arrived', 'is-upcoming');
        if (subtextEl) subtextEl.innerHTML = '';

        if (k < idx) {
          col.classList.add('is-passed');
        } else if (k === idx) {
          col.classList.add('is-current');
          if (state === 'arrived') {
            col.classList.add('is-arrived');
            if (subtextEl) {
              subtextEl.innerHTML = `<span class="shutter-arrived-badge">Arrived ${stations[k]}</span>`;
            }
          }
        } else if (k === nextIdx && state === 'inbetween') {
          col.classList.add('is-upcoming');
          if (subtextEl) {
            subtextEl.innerHTML = `<span class="shutter-eta-badge">in ${etaMinutes || '2.5'} min</span>`;
          }
        }
      }

      // Calculate the scroll position required to center the capsule in the card
      const viewportWidth = shutterScrollViewport ? shutterScrollViewport.clientWidth : 360;
      targetCapsuleScrollLeft = Math.max(0, capsuleX - (viewportWidth / 2));
    }

    // Smoothly scroll viewport to center on the capsule
    function scrollToCapsule(smooth = true) {
      if (!shutterScrollViewport) return;
      isProgrammaticScrolling = true;
      shutterScrollViewport.scrollTo({
        left: targetCapsuleScrollLeft,
        behavior: smooth ? 'smooth' : 'auto'
      });

      setTimeout(() => {
        isProgrammaticScrolling = false;
        checkResetButtonState();
      }, smooth ? 450 : 50);
    }

    // Check if user has scrolled away from the capsule
    function checkResetButtonState() {
      if (!shutterScrollViewport || !btnShutterNotifClose) return;
      const currentScroll = shutterScrollViewport.scrollLeft;
      const delta = Math.abs(currentScroll - targetCapsuleScrollLeft);

      if (delta > 45) {
        // User has scrolled away from the capsule's current area: transform '✕' into '↺ Reset'
        if (!isResetActive) {
          isResetActive = true;
          btnShutterNotifClose.classList.add('is-reset');
          btnShutterNotifClose.innerHTML = '↺ Reset';
          btnShutterNotifClose.title = 'Reset view to current train position';
          btnShutterNotifClose.setAttribute('aria-label', 'Reset view');
        }
      } else {
        // User is at the capsule's current area: restore '✕' close button
        if (isResetActive) {
          isResetActive = false;
          btnShutterNotifClose.classList.remove('is-reset');
          btnShutterNotifClose.innerHTML = '✕';
          btnShutterNotifClose.title = 'Dismiss notification';
          btnShutterNotifClose.setAttribute('aria-label', 'Dismiss');
        }
      }
    }

    // ----------------------------------------------------
    // C. TOP HEADER DYNAMIC NOTIFICATION PILL
    // ----------------------------------------------------
    function showHeaderPill(text, type, durationSec) {
      if (!headerNotifPill || !headerNotifText) return;
      if (chkShutter && chkShutter.checked && (!chkAllowAll || !chkAllowAll.checked)) {
        headerNotifPill.classList.add('header-notif-hidden');
        return;
      }

      headerNotifText.textContent = text;
      headerNotifPill.classList.remove('header-notif-hidden', 'header-notif-arrived', 'header-notif-upcoming');

      if (type === 'arrived') {
        headerNotifPill.classList.add('header-notif-arrived');
      } else {
        headerNotifPill.classList.add('header-notif-upcoming');
      }

      clearTimeout(pillTimer);
      if (durationSec && durationSec > 0) {
        pillTimer = setTimeout(() => {
          headerNotifPill.classList.add('header-notif-hidden');
        }, durationSec * 1000);
      }
    }

    function hideHeaderPill() {
      clearTimeout(pillTimer);
      if (headerNotifPill) {
        headerNotifPill.classList.add('header-notif-hidden');
      }
    }

    if (headerNotifPill) {
      headerNotifPill.addEventListener('click', (e) => {
        e.stopPropagation();
        openShutter();
      });
    }

    // ----------------------------------------------------
    // D. SMOOTH TIME-BASED STATE CYCLES: "ARRIVED AT" & "IN BETWEEN"
    // ----------------------------------------------------
    function triggerArrivedState(currStnName = null) {
      currentState = 'arrived';
      currentProgress = 0.0;
      clearInterval(transitTimer);
      clearInterval(upcomingCycleTimer);

      const stations = getActiveStations();
      if (currStnName) {
        const foundIdx = stations.findIndex(s => s.toLowerCase() === currStnName.toLowerCase());
        if (foundIdx !== -1) currentStationIdx = foundIdx;
      }
      const currStn = stations[currentStationIdx] || 'Dadar';

      // 1. Update Horizontal Timeline Track
      updateTimelineDisplay('arrived', 0.0, null);
      if (!isResetActive) {
        scrollToCapsule(true);
      }

      // 2. Show Dynamic Green Header Pill for 18 seconds (Phone 3 mockup: "till 18 sec.")
      showHeaderPill(currStn, 'arrived', 18);

      // 3. Vibration notice if enabled
      if (chkVibrate && chkVibrate.checked && 'vibrate' in navigator) {
        try { navigator.vibrate([200, 100, 200]); } catch (e) {}
      }

      // 4. After 18 seconds, transition smoothly into the "In between" cycle
      clearTimeout(pillTimer);
      pillTimer = setTimeout(() => {
        if (isTrackingActive) {
          triggerInbetweenState();
        }
      }, 18000);
    }

    function triggerInbetweenState() {
      currentState = 'inbetween';
      clearTimeout(pillTimer);
      clearInterval(upcomingCycleTimer);
      clearInterval(transitTimer);

      const stations = getActiveStations();
      const nextIdx = Math.min(stations.length - 1, currentStationIdx + 1);
      const nextStn = stations[nextIdx] || 'Matunga Rd.';

      transitElapsedSec = 0;
      currentProgress = 0.0;

      // Initial in-between render
      updateTimelineDisplay('inbetween', 0.0, (TRANSIT_DURATION_SEC / 60).toFixed(1));
      if (!isResetActive) {
        scrollToCapsule(true);
      }

      // Pulse upcoming pill every 20 seconds
      function pulseUpcomingPill() {
        if (!isTrackingActive) return;
        showHeaderPill(`Next ${nextStn}`, 'upcoming', 7);
      }
      pulseUpcomingPill();
      upcomingCycleTimer = setInterval(pulseUpcomingPill, 20000);

      // Smooth Time Movement (Image 2 Logic - NO DANCING, strictly linear time progress)
      transitTimer = setInterval(() => {
        if (currentState !== 'inbetween') return;

        transitElapsedSec += 1;
        currentProgress = Math.min(1, transitElapsedSec / TRANSIT_DURATION_SEC);
        const remainingSec = Math.max(0, TRANSIT_DURATION_SEC - transitElapsedSec);
        const remainingMin = (remainingSec / 60).toFixed(1);

        updateTimelineDisplay('inbetween', currentProgress, remainingMin);

        // Keep capsule centered in view if user hasn't scrolled away
        if (!isResetActive && shutterScrollViewport) {
          scrollToCapsule(false);
        }

        // Arrived at next station!
        if (currentProgress >= 1) {
          clearInterval(transitTimer);
          currentStationIdx = nextIdx;
          triggerArrivedState(stations[currentStationIdx]);
        }
      }, 1000);
    }

    // ----------------------------------------------------
    // E. AUTOMATIC TRACKING ENGINE (ZERO PROMPTS, 3-MIN INTERVAL)
    // ----------------------------------------------------
    function advanceToNextStation() {
      const stations = getActiveStations();
      currentStationIdx = (currentStationIdx + 1) % (stations.length - 1);
      triggerArrivedState(stations[currentStationIdx]);
    }

    function startActiveTracking() {
      isTrackingActive = true;
      const toggleInTrain = document.getElementById('toggleInTrain');
      if (toggleInTrain && !toggleInTrain.checked) {
        toggleInTrain.checked = true;
        if (activeJourneyTrain && typeof CrowdLiveEngine !== 'undefined') {
          CrowdLiveEngine.setTrainInReport(activeJourneyTrain, true, 0, currentJourneyStops);
          updateJourneyCrowdBadge();
        }
      }

      const stations = getActiveStations();
      triggerArrivedState(stations[currentStationIdx]);

      clearInterval(autoProgressTimer);
      autoProgressTimer = setInterval(() => {
        advanceToNextStation();
      }, 180000); // 3 minutes

      showToast('Stops Notification active • Live tracking enabled', 3000);
    }

    function stopActiveTracking() {
      isTrackingActive = false;
      clearInterval(autoProgressTimer);
      clearInterval(transitTimer);
      clearTimeout(pillTimer);
      clearInterval(upcomingCycleTimer);
      hideHeaderPill();
      showToast('Stops Notification paused', 2500);
    }

    // ----------------------------------------------------
    // F. CONTROLLER EVENT LISTENERS & USER INTERACTION
    // ----------------------------------------------------
    function initListeners() {
      // Test Preview Button 1: "Test 'Arrived At' (18s)"
      if (btnPrevArrived) {
        btnPrevArrived.addEventListener('click', (e) => {
          e.stopPropagation();
          const stations = getActiveStations();
          triggerArrivedState(stations[currentStationIdx]);
          showToast(`Previewing "Arrived At" (18s) for ${stations[currentStationIdx]}`, 2500);
        });
      }

      // Test Preview Button 2: "Test 'In between' (20s)"
      if (btnPrevInbetween) {
        btnPrevInbetween.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerInbetweenState();
          const stations = getActiveStations();
          const nextIdx = Math.min(stations.length - 1, currentStationIdx + 1);
          showToast(`Previewing "In between" moving towards ${stations[nextIdx]}`, 2500);
        });
      }

      // Close / Reset Button on Shutter Card (✕ or ↺ Reset)
      if (btnShutterNotifClose) {
        btnShutterNotifClose.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isResetActive) {
            // Clicked Reset button: smoothly recenter timeline back to train capsule!
            scrollToCapsule(true);
          } else {
            // Clicked ✕ button: dismiss notification card!
            if (shutterNotifCard) {
              shutterNotifCard.style.opacity = '0';
              setTimeout(() => {
                shutterNotifCard.style.display = 'none';
              }, 250);
            }
          }
        });
      }

      // Scroll Event on Viewport: detect when user scrolls away to transform button to Reset
      if (shutterScrollViewport) {
        shutterScrollViewport.addEventListener('scroll', () => {
          if (!isProgrammaticScrolling) {
            checkResetButtonState();
          }
        }, { passive: true });

        // Desktop mouse drag-to-scroll support
        let isMouseDown = false;
        let mouseStartX = 0;
        let mouseScrollStartX = 0;

        shutterScrollViewport.addEventListener('mousedown', (e) => {
          isMouseDown = true;
          mouseStartX = e.pageX - shutterScrollViewport.offsetLeft;
          mouseScrollStartX = shutterScrollViewport.scrollLeft;
        });

        window.addEventListener('mousemove', (e) => {
          if (!isMouseDown || !shutterScrollViewport) return;
          e.preventDefault();
          const x = e.pageX - shutterScrollViewport.offsetLeft;
          const walk = (x - mouseStartX) * 1.3;
          shutterScrollViewport.scrollLeft = mouseScrollStartX - walk;
        });

        window.addEventListener('mouseup', () => {
          if (isMouseDown) {
            isMouseDown = false;
          }
        });
      }

      // Settings Cog button in Shutter opens Drawer Menu
      const btnShadeSettings = document.getElementById('btnShadeSettings');
      if (btnShadeSettings) {
        btnShadeSettings.addEventListener('click', () => {
          closeShutter();
          const sideDrawerOverlay = document.getElementById('sideDrawerOverlay');
          if (sideDrawerOverlay) {
            sideDrawerOverlay.classList.add('drawer-open');
          }
        });
      }
    }

    return {
      init: () => {
        initShutterGestures();
        initListeners();
        renderFullTimelineTrack();
        updateTimelineDisplay(currentState, currentProgress, null);
      },
      triggerArrived: triggerArrivedState,
      triggerInbetween: triggerInbetweenState,
      openShutter,
      closeShutter,
      setLine: (lineCode) => {
        if (MUMBAI_CORRIDOR_LINES[lineCode]) {
          activeLineKey = lineCode;
          currentStationIdx = Math.min(MUMBAI_CORRIDOR_LINES[lineCode].stations.length - 1, 8);
          renderFullTimelineTrack();
          updateTimelineDisplay(currentState, currentProgress, null);
          scrollToCapsule(true);
        }
      }
    };
  })();

  // Initialize Stops Notification Controller
  StopsNotificationController.init();

  // ==========================================================================
  // 10. SILENT 2-HOUR BACKGROUND OVER-THE-AIR (OTA) TIMETABLE SYNC WORKER
  //     (Checks every 2 hours silently, zero loading modal, always accurate)
  // ==========================================================================
  const SilentOTASyncWorker = (() => {
    const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
    const STORAGE_KEY_VER = 'mumbai_local_timetable_version';
    const STORAGE_KEY_LAST_CHECK = 'mumbai_local_last_sync_check';
    let localVersion = localStorage.getItem(STORAGE_KEY_VER) || '2026.10.02.011';
    let isChecking = false;

    async function checkForUpdatesSilently(isManual = false) {
      if (isChecking) return;
      if (!navigator.onLine) return; // Silent skip if offline

      try {
        isChecking = true;
        const res = await fetch('/api/timetable/manifest', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!res.ok) return;

        const manifest = await res.json();
        const latestVer = manifest.latestVersion;
        localStorage.setItem(STORAGE_KEY_LAST_CHECK, String(Date.now()));

        if (latestVer && latestVer !== localVersion) {
          console.log(`[Silent OTA Sync] New timetable version detected: ${latestVer} (Local: ${localVersion}). Hot-patching silently...`);
          localVersion = latestVer;
          localStorage.setItem(STORAGE_KEY_VER, latestVer);

          // If results screen is active, refresh the trains silently in background without a blocking modal!
          const resultsScreen = document.getElementById('screen-train-results');
          if (resultsScreen && resultsScreen.classList.contains('active') && fromStation && toStation) {
            const trainsRes = await fetch(`/api/trains?from=${fromStation.id}&to=${toStation.id}`);
            if (trainsRes.ok) {
              const freshTrains = await trainsRes.json();
              currentTrains = freshTrains;
              renderTimetableTiles(getFilteredTrains(), false);
            }
          }
        }
      } catch (e) {
        // Silent catch: never disrupt the user with network errors
      } finally {
        isChecking = false;
      }
    }

    function init() {
      // 1. Initial silent check on app startup (if > 2 hours or version check needed)
      const lastCheck = parseInt(localStorage.getItem(STORAGE_KEY_LAST_CHECK) || '0', 10);
      const elapsed = Date.now() - lastCheck;
      if (elapsed > SYNC_INTERVAL_MS || !localStorage.getItem(STORAGE_KEY_VER)) {
        setTimeout(() => checkForUpdatesSilently(false), 2000);
      }

      // 2. Periodic 2-hour interval
      setInterval(() => {
        checkForUpdatesSilently(false);
      }, SYNC_INTERVAL_MS);

      // 3. Trigger check when phone reconnects to internet
      window.addEventListener('online', () => {
        setTimeout(() => checkForUpdatesSilently(false), 1500);
      });
    }

    return { init, checkNow: () => checkForUpdatesSilently(true) };
  })();

  // Initialize Silent OTA Sync Worker
  SilentOTASyncWorker.init();

});

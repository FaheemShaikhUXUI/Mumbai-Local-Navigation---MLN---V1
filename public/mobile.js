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
      const key = this.getTrainKey(trainItem);
      const rep = this.reports[key];
      if (rep && rep.isActive && rep.delayMinutes > 0) {
        return rep.delayMinutes;
      }
      return 0; // Default is strictly 0 (On-Time) as requested!
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

  // Update Status Bar Clock
  function updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const el = document.getElementById('statusTime');
    if (el) el.textContent = `${hh}:${mm}`;
  }
  updateClock();
  setInterval(updateClock, 30000);

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
    // Splash screen runs for exactly 2 seconds as requested in wireframe
    setTimeout(() => {
      if (isAuthenticated) {
        showScreen('screen-home');
      } else {
        showScreen('screen-mobile-login');
      }
    }, 2000);
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
    const enabled = prefs.enabled || false;
    if (toggleNotif) toggleNotif.checked = enabled;
    if (accordion) accordion.classList.toggle('open', enabled);
    if (chkShutter)  chkShutter.checked  = Boolean(prefs.shutter);
    if (chkHeader)   chkHeader.checked   = Boolean(prefs.header);
    if (chkVibrate)  chkVibrate.checked  = Boolean(prefs.vibrate);
    if (chkAllowAll) chkAllowAll.checked = Boolean(prefs.allowAll);
  }

  // -- Toggle main switch → open/close accordion --
  if (toggleNotif) {
    toggleNotif.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      const prefs = getNotifPrefs();
      prefs.enabled = enabled;

      // When first enabled, default to "Allow All"
      if (enabled && !prefs.shutter && !prefs.header && !prefs.allowAll) {
        prefs.allowAll = true;
        prefs.shutter  = true;
        prefs.header   = true;
        prefs.vibrate  = true;
      }
      saveNotifPrefs(prefs);

      if (accordion) accordion.classList.toggle('open', enabled);

      if (chkShutter)  chkShutter.checked  = Boolean(prefs.shutter);
      if (chkHeader)   chkHeader.checked   = Boolean(prefs.header);
      if (chkVibrate)  chkVibrate.checked  = Boolean(prefs.vibrate);
      if (chkAllowAll) chkAllowAll.checked = Boolean(prefs.allowAll);

      if (!enabled) {
        notifEngine.stopAll();
        showToast('🔕 Stops Notification Disabled');
      } else {
        showToast('🔔 Stops Notification Enabled');
        // Trigger live demonstration showing Arrived & In-between states!
        notifEngine.triggerDemo(prefs);
      }
    });
  }

  // Clicking anywhere on the drawer menu item row toggles the switch
  if (menuItemStopsNotif) {
    menuItemStopsNotif.addEventListener('click', (e) => {
      if (e.target.closest('.drawer-toggle-switch')) return;
      if (toggleNotif) {
        toggleNotif.checked = !toggleNotif.checked;
        toggleNotif.dispatchEvent(new Event('change'));
      }
    });
  }

  // ========================================================
  // Accordion 4 Options Logic:
  // 1. Show Only in Shutter (Check Box)
  // 2. Show only in header (Check Box)
  // 3. Vibrat before 1 mnts (Check Box)
  // 4. Allow All (Check Box)
  // ========================================================

  // 1. Show Only in Shutter
  chkShutter?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const prefs = getNotifPrefs();

    if (isChecked) {
      prefs.shutter  = true;
      prefs.header   = false;
      prefs.allowAll = false;
      if (chkHeader)   chkHeader.checked   = false;
      if (chkAllowAll) chkAllowAll.checked = false;
      hideHeaderPill();
      showToast('📱 Stops Notification: Show Only in Shutter');
    } else {
      prefs.shutter = false;
      hideShutterCard();
    }
    saveNotifPrefs(prefs);
    if (prefs.enabled && isChecked) notifEngine.triggerDemo(prefs);
  });

  // 2. Show only in header
  chkHeader?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const prefs = getNotifPrefs();

    if (isChecked) {
      prefs.header   = true;
      prefs.shutter  = false;
      prefs.allowAll = false;
      if (chkShutter)  chkShutter.checked  = false;
      if (chkAllowAll) chkAllowAll.checked = false;
      hideShutterCard();
      showToast('📌 Stops Notification: Show Only in Header Bar');
    } else {
      prefs.header = false;
      hideHeaderPill();
    }
    saveNotifPrefs(prefs);
    if (prefs.enabled && isChecked) notifEngine.triggerDemo(prefs);
  });

  // 3. Vibrat before 1 mnts
  chkVibrate?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const prefs = getNotifPrefs();
    prefs.vibrate = isChecked;

    if (isChecked) {
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
      showToast('📳 Vibrate Before 1 Minute Enabled');
    } else {
      prefs.allowAll = false;
      if (chkAllowAll) chkAllowAll.checked = false;
    }
    saveNotifPrefs(prefs);
  });

  // 4. Allow All
  chkAllowAll?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const prefs = getNotifPrefs();

    prefs.allowAll = isChecked;
    prefs.shutter  = isChecked;
    prefs.header   = isChecked;
    prefs.vibrate  = isChecked;

    if (chkShutter)  chkShutter.checked  = isChecked;
    if (chkHeader)   chkHeader.checked   = isChecked;
    if (chkVibrate)  chkVibrate.checked  = isChecked;

    saveNotifPrefs(prefs);

    if (isChecked) {
      showToast('✨ All Notifications Enabled (Shutter + Header + Vibration)');
      if (prefs.enabled) notifEngine.triggerDemo(prefs);
    } else {
      notifEngine.stopAll();
      showToast('🔕 All Notification options cleared');
    }
  });

  // -- Full Android Shutter Pull-down Shade handling --
  function openAndroidShade() {
    if (!androidShutterShade) return;
    androidShutterShade.classList.add('shade-open');
    androidShutterShade.setAttribute('aria-hidden', 'false');
    syncShadeCardHost();
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

  function syncShadeCardHost() {
    if (!shadeMlCardHost || !shutterCard) return;
    shadeMlCardHost.innerHTML = '';
    const clone = shutterCard.cloneNode(true);
    clone.id = 'shutterNotifCard_shade';
    clone.classList.remove('shutter-notif-hidden');
    clone.classList.add('shutter-notif-visible');
    clone.style.position = 'static';
    clone.style.width = '100%';
    const closeBtn = clone.querySelector('.shutter-notif-close');
    if (closeBtn) closeBtn.style.display = 'none';
    shadeMlCardHost.appendChild(clone);
  }

  phoneStatusBar?.addEventListener('click', toggleAndroidShade);
  shadeBackdrop?.addEventListener('click', closeAndroidShade);
  shadePullHandle?.addEventListener('click', closeAndroidShade);

  // -- Shutter card controls --
  function showShutterCard() {
    if (!shutterCard) return;
    shutterCard.classList.remove('shutter-notif-hidden');
    shutterCard.classList.add('shutter-notif-visible');
    syncShadeCardHost();
  }

  function hideShutterCard() {
    if (!shutterCard) return;
    shutterCard.classList.remove('shutter-notif-visible');
    shutterCard.classList.add('shutter-notif-hidden');
    syncShadeCardHost();
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
  // ========================================================
  const notifEngine = {
    _shutterTimer: null,
    _headerTimer: null,
    _upcomingInterval: null,

    // Called when a journey stop is reached (Arrival state: Phone 1 & Phone 3)
    // "Arrived: Notification Will show like this on any screen till 18 sec. (Dynamic Width according to name)"
    onArrived(stationName = 'Dadar', prevStation = 'Prabhadevi', nextStation = 'Matunga Rd.') {
      const prefs = getNotifPrefs();
      if (!prefs.enabled) return;

      const showS = prefs.shutter || prefs.allowAll;
      const showH = prefs.header  || prefs.allowAll;

      // 1. Shutter Notification Card (Phone 1 Mockup)
      if (showS) {
        updateShutterCard({
          prev: prevStation,
          curr: stationName,
          next: nextStation,
          state: 'arrived'
        });
        clearTimeout(this._shutterTimer);
        // Show till 18 seconds!
        this._shutterTimer = setTimeout(() => hideShutterCard(), 18000);
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

      const showS = prefs.shutter || prefs.allowAll;
      const showH = prefs.header  || prefs.allowAll;

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
        this.onInBetween(prevStation, currStation, nextStation, 'in 2.5 min');
      }, 20000);
    },

    // Live demonstration showing both mockups sequentially
    triggerDemo(prefs) {
      if (!prefs.shutter && !prefs.header && !prefs.allowAll) return;
      this.stopAll();

      const showS = prefs.shutter || prefs.allowAll;
      const showH = prefs.header  || prefs.allowAll;

      // Stage 1: Arrived At Dadar (Phone 1 & Phone 3)
      if (showS) {
        updateShutterCard({ prev: 'Prabhadevi', curr: 'Dadar', next: 'Matunga Rd.', state: 'arrived' });
      }
      if (showH) {
        showHeaderPill('Dadar', 'arrived');
      }

      // Stage 2: After 5 seconds, simulate departing towards next stop (Phone 2 & Phone 4)
      this._shutterTimer = setTimeout(() => {
        if (showS) {
          updateShutterCard({ prev: 'Prabhadevi', curr: 'Dadar', next: 'Matunga Rd.', state: 'inbetween', eta: 'in 2.5 min' });
        }
        if (showH) {
          showHeaderPill('Next Matunga Rd.', 'upcoming');
        }

        // Auto-dismiss demo after 7 more seconds
        this._shutterTimer = setTimeout(() => {
          hideShutterCard();
          hideHeaderPill();
        }, 7000);
      }, 5000);
    },

    stopAll() {
      clearTimeout(this._shutterTimer);
      clearTimeout(this._headerTimer);
      clearInterval(this._upcomingInterval);
      hideShutterCard();
      hideHeaderPill();
      closeAndroidShade();
    }
  };

  // Expose engine to window for global access
  window.stopsNotifEngine = notifEngine;

  // Restore prefs on load
  restoreNotifUI();

  // Preview Test Buttons in Stops Notification Accordion
  document.getElementById('btnPreviewArrived')?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifEngine.stopAll();
    const prefs = getNotifPrefs();
    const showS = prefs.shutter !== false;
    const showH = prefs.header !== false;
    if (showS) updateShutterCard({ prev: 'Prabhadevi', curr: 'Dadar', next: 'Matunga Rd.', state: 'arrived' });
    if (showH) showHeaderPill('Dadar', 'arrived');
    showToast('🟢 Testing "Arrived At: Dadar" Notification (18s)');
  });

  document.getElementById('btnPreviewInbetween')?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifEngine.stopAll();
    const prefs = getNotifPrefs();
    const showS = prefs.shutter !== false;
    const showH = prefs.header !== false;
    if (showS) updateShutterCard({ prev: 'Prabhadevi', curr: 'Dadar', next: 'Matunga Rd.', state: 'inbetween', eta: 'in 2.5 min' });
    if (showH) showHeaderPill('Next Matunga Rd.', 'upcoming');
    showToast('🟠 Testing "In between: Next Matunga Rd." Notification');
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
        return lineFiltered;
      }
      return allStations.filter(s => 
        s.station_name.toLowerCase().includes(q) || s.station_code.toLowerCase().includes(q)
      );
    }

    return list;
  }

  async function loadData() {
    try {
      // Load stations
      const stnRes = await fetch('/api/stations');
      allStations = await stnRes.json();
      renderStationDirectory(getStationsForDisplay());

      // Load lines
      const lineRes = await fetch('/api/lines');
      allLines = await lineRes.json();
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }
  loadData();

  // Render Station Directory List
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
      return `
        <div class="station-list-row" data-id="${s.id}" data-name="${s.station_name}" data-code="${s.station_code}">
          <div>
            <div class="station-row-name">${s.station_name}</div>
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
    if (tile === 'from') {
      fromInputBox?.classList.add('tile-active');
      toInputBox?.classList.remove('tile-active');
    } else {
      toInputBox?.classList.add('tile-active');
      fromInputBox?.classList.remove('tile-active');
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
    // Borivali (Exact Match to User Reference Image 2!)
    stn_bvi: [
      { label: 'Virar / Dahanu', destName: 'Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Andheri / Bandra / Churchgate', destName: 'Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
    ],
    // Dadar (Major WR & CR interchange - User Specification: "Borivali/Virar/Dahanu")
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
    // Churchgate (Western Line Southern Terminal)
    stn_ccg: [
      { label: 'Borivali / Virar / Dahanu', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' }
    ],
    // Virar
    stn_vr: [
      { label: 'Dahanu Road', destName: 'Dahanu Road', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Borivali / Churchgate', destName: 'Borivali / Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
    ],
    // Dahanu Road
    stn_drd: [
      { label: 'Virar / Churchgate', destName: 'Virar / Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
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
    // Neral (Central Main & Matheran)
    stn_nrl: [
      { label: 'Karjat / Khopoli', destName: 'Karjat / Khopoli', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_KARJAT' },
      { label: 'Kalyan / CSMT', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' },
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

    const wrIdx = WR_CODES.indexOf(code);
    if (wrIdx !== -1) {
      if (wrIdx === 0) return [
        { label: 'Borivali / Virar / Dahanu', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' }
      ];
      if (wrIdx < 21) return [
        { label: 'Borivali / Virar / Dahanu', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
        { label: 'Churchgate', destName: 'Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
      ];
      if (wrIdx < 28) return [
        { label: 'Virar / Dahanu', destName: 'Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
        { label: 'Borivali / Churchgate', destName: 'Borivali / Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
      ];
      if (wrIdx === 36) return [
        { label: 'Virar / Churchgate', destName: 'Virar / Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
      ];
      return [
        { label: 'Dahanu Road', destName: 'Dahanu Road', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
        { label: 'Virar / Churchgate', destName: 'Virar / Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
      ];
    }

    const crIdx = CR_MAIN_CODES.indexOf(code);
    if (crIdx !== -1) {
      if (crIdx === 0) return [
        { label: 'Thane / Kalyan / Kasara / Karjat', destName: 'Thane / Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' }
      ];
      if (crIdx <= 25) return [
        { label: 'Thane / Kalyan / Kasara / Karjat', destName: 'Thane / Kalyan / Kasara / Karjat', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_NORTH' },
        { label: 'CSMT', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' }
      ];
      if (crIdx <= 36) return [
        { label: 'Asangaon / Kasara', destName: 'Asangaon / Kasara', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_KASARA' },
        { label: 'Kalyan / CSMT', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' }
      ];
      return [
        { label: 'Karjat / Khopoli', destName: 'Karjat / Khopoli', direction: 'DN', lineId: 'line_cr_main', corridor: 'CR_KARJAT' },
        { label: 'Kalyan / CSMT', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_main', corridor: 'CR_SOUTH' }
      ];
    }

    if (HARBOUR_CODES.includes(code)) {
      return [
        { label: 'Vashi / Belapur / Panvel', destName: 'Vashi / Belapur / Panvel', direction: 'DN', lineId: 'line_cr_harbour', corridor: 'HB_PANVEL' },
        { label: 'Vadala / CSMT', destName: 'CSMT', direction: 'UP', lineId: 'line_cr_harbour', corridor: 'HB_CSMT' }
      ];
    }

    if (TRANS_HARBOUR_CODES.includes(code)) {
      return [
        { label: 'Vashi / Belapur / Panvel', destName: 'Vashi / Belapur / Panvel', direction: 'DN', lineId: 'line_cr_trans_harbour' },
        { label: 'Thane', destName: 'Thane', direction: 'UP', lineId: 'line_cr_trans_harbour' }
      ];
    }

    if (URAN_CODES.includes(code)) {
      return [
        { label: 'Uran / Dronagiri', destName: 'Uran / Dronagiri', direction: 'DN', lineId: 'line_cr_uran' },
        { label: 'Nerul / Belapur', destName: 'Nerul / Belapur', direction: 'UP', lineId: 'line_cr_uran' }
      ];
    }

    if (VASAI_DIVA_CODES.includes(code)) {
      return [
        { label: 'Vasai Road', destName: 'Vasai Road', direction: 'UP', lineId: 'line_cr_vasai_diva_panvel' },
        { label: 'Panvel / Diva', destName: 'Panvel / Diva', direction: 'DN', lineId: 'line_cr_vasai_diva_panvel' }
      ];
    }

    if (PUNE_CODES.includes(code)) {
      return [
        { label: 'Shivajinagar / Pune', destName: 'Pune Junction', direction: 'DN', lineId: 'line_cr_pune_suburban' },
        { label: 'Lonavala / Talegaon', destName: 'Lonavala', direction: 'UP', lineId: 'line_cr_pune_suburban' }
      ];
    }

    return [
      { label: 'Borivali / Virar / Dahanu', destName: 'Borivali / Virar / Dahanu', direction: 'DN', lineId: 'line_wr_suburban', corridor: 'WR_NORTH' },
      { label: 'Churchgate / CSMT', destName: 'Churchgate', direction: 'UP', lineId: 'line_wr_suburban', corridor: 'WR_SOUTH' }
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
    return allStations.find(s => 
      s.station_name.toLowerCase() === clean || 
      s.station_code.toLowerCase() === clean
    ) || allStations.find(s =>
      s.station_name.toLowerCase().startsWith(clean)
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
    if (selectedFromStation && tileCenterExtension && !tileCenterExtension.classList.contains('expanded') && !selectedToStation) {
      showTileCenterDirections(selectedFromStation.id);
    } else {
      renderStationDirectory(getStationsForDisplay(fromInput?.value?.trim() || ''));
    }
  });

  fromInput?.addEventListener('focus', () => {
    setActiveSearchTile('from');
    if (!selectedFromStation) {
      renderStationDirectory(getStationsForDisplay(fromInput?.value?.trim() || ''));
    }
  });

  // Clicking on Lower tile ('To') selects it and turns it Purple
  toInputBox?.addEventListener('click', (e) => {
    if (e.target.closest('#toSearchIconBtn')) return;
    setActiveSearchTile('to');
    toInput?.focus();
    if (tileCenterExtension) {
      tileCenterExtension.classList.remove('expanded');
    }
    const currentQuery = (toInput?.value || '').trim();
    const filtered = selectedFromStation 
      ? getStationsForDisplay(currentQuery).filter(s => s.id !== selectedFromStation.id)
      : getStationsForDisplay(currentQuery);
    renderStationDirectory(filtered);
  });

  toInput?.addEventListener('focus', () => {
    setActiveSearchTile('to');
    if (tileCenterExtension) {
      tileCenterExtension.classList.remove('expanded');
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
      // Set default nearest station (e.g. Borivali as in user screenshot!)
      const bvi = allStations.find(s => s.id === 'stn_bvi') || { id: 'stn_bvi', station_name: 'Borivali' };
      setFromStation(bvi.id, bvi.station_name);
      setActiveSearchTile('to');
      checkShowResultsButton();
      showToast('📍 Located nearest station: Borivali');
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
  let currentTimetableFilter = 'ALL';
  let simulatedMinutesOffset = null; // null = Live Mumbai clock; number = manual offset in minutes for development testing
  let lastClockMinute = null;

  // Accurately compute Mumbai (Asia/Kolkata / IST, UTC+5:30) time across devices
  function getMumbaiLiveDate() {
    const now = new Date();
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const mumbaiDate = new Date(istString);
    if (simulatedMinutesOffset !== null) {
      mumbaiDate.setMinutes(mumbaiDate.getMinutes() + simulatedMinutesOffset);
    }
    return mumbaiDate;
  }

  function getActiveCurrentMinutes() {
    const d = getMumbaiLiveDate();
    return d.getHours() * 60 + d.getMinutes();
  }

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

    // Check train journey live position every second (only re-renders if station/transit state changes)
    const journeyScreen = document.getElementById('screen-train-journey');
    if (journeyScreen && journeyScreen.classList.contains('active') && currentJourneyStops.length > 0 && activeJourneyTrain) {
      refreshJourneyCurrentStop(false);
    }
  }, 1000);

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

  function getServiceDayMinutes(timeStrOrMinutes) {
    let m = typeof timeStrOrMinutes === 'number' ? timeStrOrMinutes : parseTimeToMinutes(timeStrOrMinutes);
    return m < SERVICE_DAY_START_MINUTES ? m + 1440 : m;
  }

  function getActiveServiceDayMinutes() {
    return getServiceDayMinutes(getActiveCurrentMinutes());
  }

  function getTimeDifferenceMinutes(trainMinutes, currentMinutes) {
    const tMin = getServiceDayMinutes(trainMinutes);
    const cMin = getServiceDayMinutes(currentMinutes);
    return tMin - cMin;
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

    const currentServiceMin = getActiveServiceDayMinutes();

    let arrivedIdx = -1;
    let arrivingSoonIdx = -1;
    let nextUpcomingIdx = -1;
    let minPositiveDiff = Infinity;

    for (let i = 0; i < trains.length; i++) {
      const rawTime = trains[i].departureTime || trains[i].fromStop?.departure_time;
      const tMin = getServiceDayMinutes(rawTime);
      const diff = tMin - currentServiceMin;

      // Exact match with current minute: Train is Arrived
      if (diff === 0 && arrivedIdx === -1) {
        arrivedIdx = i;
      }
      // 1 minute remaining before train departs: Arriving 1M
      if (diff === 1 && arrivingSoonIdx === -1) {
        arrivingSoonIdx = i;
      }
      // Next upcoming train
      if (diff >= 0 && diff < minPositiveDiff) {
        minPositiveDiff = diff;
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

  // Real-time Train Delay Detection Logic (Phase 1 & 2 Crowdsourced Live Tracking)
  // By default, every train is on-time (delay = 0). ONLY when someone toggles ON is late info displayed!
  function getTrainDelayMinutes(item, idx, hasArrivalAnimation) {
    if (!item) return 0;
    return CrowdLiveEngine.getTrainDelay(item);
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

  function renderSingleTrainTileHtml(item, idx, currentMinutes) {
    const isFast = isTrainFast(item);
    const isAc = isTrainAc(item);
    const isSlow = !isFast;

    // 1. Departure Time (Strict 12-hour AM/PM type: e.g. 03:40 AM)
    const rawTime = item.departureTime || item.fromStop?.departure_time || '05:45:00';
    const { hhmm, ampm } = formatTime12(rawTime);
    const trainMinutes = parseTimeToMinutes(rawTime);
    const diff = getTimeDifferenceMinutes(trainMinutes, currentMinutes);

    const isArrivingSoon = (diff === 1);
    const isArrived = (diff === 0);
    const isPast = (diff < 0);
    const hasArrivalAnimation = isArrivingSoon || isArrived;

    // 2. Destination / Speed label
    let destName = item.destinationStation?.station_name || 'Churchgate';
    destName = destName.replace(' Road', '').replace(' Suburban', '');
    const hasDot = !hasArrivalAnimation && (destName.toLowerCase() === 'nalasopara' || destName.toLowerCase() === 'andheri');

    let arrivalAnimationHtml = '';
    let statusBadgeHtml = '';

    if (isArrived) {
      arrivalAnimationHtml = `
        <span class="tile-arrived-dot-wrapper" title="Train Arrived at Platform">
          <span class="tile-arrived-dot"></span>
          <span class="tile-arrived-ring"></span>
        </span>
      `;
      statusBadgeHtml = `<span class="tile-status-tag tag-arrived">ARRIVED</span>`;
    } else if (isArrivingSoon) {
      arrivalAnimationHtml = `
        <span class="tile-arrived-dot-wrapper is-arriving-soon" title="Arriving in 1 minute">
          <span class="tile-arrived-dot arriving-dot"></span>
          <span class="tile-arrived-ring"></span>
        </span>
      `;
      statusBadgeHtml = `<span class="tile-status-tag tag-arriving">ARRIVING 1M</span>`;
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

    // 5. Real-time Delay Detection (Late by 15 mnts in orange, small text below Platform)
    const delayMinutes = getTrainDelayMinutes(item, idx, hasArrivalAnimation);
    const hasDelay = delayMinutes > 0;
    const delayText = `Late by ${delayMinutes} mnts`;
    const speedColorClass = isFast ? 'color-fast' : 'color-slow';

    let arrivalClass = '';
    if (isArrived) arrivalClass = 'tile-arrived tile-arrival-active';
    else if (isArrivingSoon) arrivalClass = 'tile-arriving tile-arrival-active';

    // Design Version 2:
    // Top Row: [Time (03:40 AM) + Station Name (Churchgate) + Badges]     [Platform (PF: 03)]
    // Bottom Row: [Route (Virar - Churchgate)]                           [Late by 15 mnts (Orange)]
    return `
      <div class="train-timetable-tile ${isAc ? 'tile-ac' : ''} ${arrivalClass} ${hasDelay ? 'tile-has-delay' : ''} ${isPast ? 'tile-past-schedule' : ''}" data-train-idx="${idx}" id="train-tile-${idx}">
        <div class="tile-top-row">
          <div class="tile-dest-box">
            <div class="tile-time-box">
              <span class="tile-time-val">${hhmm}</span>
              <span class="tile-time-ampm">${ampm}</span>
            </div>
            <span class="tile-dest-text ${speedColorClass}">${destName}</span>
            ${arrivalAnimationHtml}
            ${statusBadgeHtml}
            ${hasDot ? '<span class="tile-dot">•</span>' : ''}
            ${isAc ? '<span class="tile-ac-badge">AC</span>' : ''}
          </div>
          <span class="tile-platform-text">${pfStr}</span>
        </div>
        <div class="tile-bottom-row">
          <span class="tile-route-text">${routeStr}</span>
          ${hasDelay ? `<span class="tile-delay-text">${delayText}</span>` : '<span class="tile-delay-text on-time"></span>'}
        </div>
      </div>
    `;
  }

  function renderTimetableTiles(trains, shouldAutoScroll = true) {
    const container = document.getElementById('timetableTilesContainer');
    if (!container) return;

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

    // Click on tile -> Open Train Journey / Route Stops View (Design Screen 6)
    container.querySelectorAll('.train-timetable-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const idx = parseInt(tile.getAttribute('data-train-idx'), 10);
        const t = sortedTrains[idx];
        if (t) {
          openTrainJourneyScreen(t, idx);
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

  // FAB Voice Search Simulation
  document.getElementById('btnVoiceFab')?.addEventListener('click', () => {
    showToast('🎙️ AI Voice Search: Listening... Try saying "Dadar to Virar"', 4000);
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

  function generateFallbackStopsForTrain(trainItem) {
    const orig = trainItem.originStation?.station_name || 'Churchgate';
    const dest = trainItem.destinationStation?.station_name || 'Virar';
    const isFast = isTrainFast(trainItem);
    const rawTime = trainItem.departureTime || trainItem.fromStop?.departure_time || '05:45:00';
    const startMin = parseTimeToMinutes(rawTime);

    const wrStops = [
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
      { name: 'Virar', code: 'VR', major: true }
    ];

    let filtered = wrStops;
    if (isFast) {
      filtered = wrStops.filter(s => s.major || s.name.toLowerCase().includes(orig.toLowerCase()) || s.name.toLowerCase().includes(dest.toLowerCase()));
    }

    return filtered.map((s, idx) => {
      const m = (startMin + idx * (isFast ? 6 : 3)) % 1440;
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      return {
        sequence: idx + 1,
        stationName: s.name,
        stationCode: s.code,
        departure_time: `${hh}:${mm}:00`,
        arrival_time: `${hh}:${mm}:00`,
        platform: s.major ? (isFast ? '03' : '02') : '01',
        isOrigin: idx === 0,
        isDestination: idx === filtered.length - 1
      };
    });
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

        // Smooth top position from 2% (touching station i dot) down to 98% (touching station i+1 dot)
        const topPercent = parseFloat((2 + rawProgress * 96).toFixed(2));

        // Touching dot threshold:
        // When leaving station i (rawProgress <= 0.12) -> touching station i dot (GREEN)
        // When approaching/touching station i + 1 (rawProgress >= 0.86) -> touching station i + 1 dot (GREEN)
        // In-between (0.12 < rawProgress < 0.86) -> traveling down the track (ORANGE)
        const isTouchingDot = (rawProgress <= 0.12) || (rawProgress >= 0.86);
        const activeStationIdx = (rawProgress >= 0.86) ? (i + 1) : i;

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
          topPercent,
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
      topPercent: 98,
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

    // Support object or numeric index
    if (typeof livePos === 'number') {
      livePos = {
        mode: 'BETWEEN',
        stationIdx: livePos,
        fromIdx: Math.max(0, livePos - 1),
        toIdx: livePos,
        topPercent: 50,
        isTouchingDot: false
      };
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

      const isTouchingThisStop = Boolean(livePos.isTouchingDot && livePos.stationIdx === idx);
      const isPassed = (idx < livePos.fromIdx) || (idx === livePos.fromIdx && !isTouchingThisStop);

      // 12-hour AM/PM Time
      const stopRaw = stop.departure_time || stop.arrival_time || '05:45:00';
      const stopTime = formatTime12(stopRaw);

      // Platform: populated for ALL stops
      const pfStr = getStopPlatform(stop, isMajor, isFast, trainItem, idx);

      html += `
        <div class="journey-stop-row ${isMajor ? 'is-major' : 'is-minor'} ${isTouchingThisStop ? 'is-current' : ''} ${isPassed ? 'is-passed' : ''}" id="journey-stop-${idx}" data-stop-idx="${idx}">
          <div class="stop-time">
            <span class="stop-time-val">${stopTime.hhmm}</span>
            <span class="stop-time-ampm">${stopTime.ampm}</span>
            ${(delayMinutes > 0 && isTouchingThisStop) ? `<span class="stop-delay-badge">+${delayMinutes}m</span>` : ''}
          </div>

          <div class="stop-track">
            <div class="stop-track-line line-top ${idx === 0 ? 'hidden' : ''}"></div>
            <div class="stop-dot-anchor">
              <div class="stop-dot ${isTouchingThisStop ? 'is-touched' : ''}"></div>
            </div>
            <div class="stop-track-line line-bottom ${idx === total - 1 ? 'hidden' : ''}"></div>
          </div>

          <div class="stop-content">
            <div class="stop-station-col">
              <span class="stop-station-name">${sName}</span>
              ${isTouchingThisStop ? '<span class="stop-arrived-text">Arrived here</span>' : ''}
            </div>
            <div class="stop-meta-right">
              ${pfStr ? `<span class="stop-pf-badge">PF: ${pfStr}</span>` : ''}
            </div>
          </div>
        </div>
      `;

      // Continuous moving capsule in the active transit segment (smooth green when touching dot, orange when in between)
      if (idx === livePos.fromIdx && idx < total - 1) {
        const topP = livePos.topPercent || 50;
        const isGreen = Boolean(livePos.isTouchingDot);
        html += `
          <div class="journey-between-row" id="journey-between-${idx}">
            <div class="between-time-spacer"></div>
            <div class="between-track">
              <div class="between-track-line" style="background: linear-gradient(180deg, #A855F7 0%, #A855F7 ${topP}%, rgba(255, 255, 255, 0.22) ${topP}%, rgba(255, 255, 255, 0.22) 100%);"></div>
              <div class="train-capsule-orange ${isGreen ? 'is-green' : 'is-orange'} is-moving" style="top: ${topP}%;"></div>
            </div>
            <div class="between-content">
              <span class="between-text ${isGreen ? 'is-arriving' : ''}">${isGreen ? 'Arriving' : 'Between'}</span>
            </div>
          </div>
        `;
      }
    }

    stopsContainer.innerHTML = html;

    if (shouldScroll) {
      setTimeout(() => {
        let scrollTarget = null;
        if (livePos.mode === 'BETWEEN') {
          scrollTarget = document.getElementById(`journey-between-${livePos.fromIdx}`);
        }
        if (!scrollTarget && livePos.stationIdx >= 0) {
          scrollTarget = document.getElementById(`journey-stop-${livePos.stationIdx}`);
        }
        if (!scrollTarget && livePos.fromIdx >= 0) {
          scrollTarget = document.getElementById(`journey-stop-${livePos.fromIdx}`);
        }

        if (scrollTarget && stopsContainer) {
          const topPos = scrollTarget.offsetTop;
          stopsContainer.scrollTo({
            top: Math.max(0, topPos - 130),
            behavior: 'smooth'
          });
        }
      }, 80);
    }
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

  function refreshJourneyCurrentStop(shouldScroll = true) {
    if (!currentJourneyStops || currentJourneyStops.length === 0 || !activeJourneyTrain) return;
    const livePos = calculateTrainLivePosition(currentJourneyStops, activeJourneyTrain);
    const liveKey = `${livePos.fromIdx}_${livePos.delayMinutes}`;

    if (shouldScroll || liveKey !== lastJourneyLiveKey) {
      lastJourneyLiveKey = liveKey;
      renderJourneyStopsList(currentJourneyStops, livePos, activeJourneyTrain, shouldScroll);

      // Trigger Stops Notification when train state changes!
      if (window.stopsNotifEngine) {
        if (livePos.isTouchingDot) {
          const curr = currentJourneyStops[livePos.stationIdx]?.station?.station_name || currentJourneyStops[livePos.stationIdx]?.station_name || 'Dadar';
          const prev = (livePos.stationIdx > 0) ? (currentJourneyStops[livePos.stationIdx - 1]?.station?.station_name || currentJourneyStops[livePos.stationIdx - 1]?.station_name) : 'Prabhadevi';
          const next = (livePos.stationIdx < currentJourneyStops.length - 1) ? (currentJourneyStops[livePos.stationIdx + 1]?.station?.station_name || currentJourneyStops[livePos.stationIdx + 1]?.station_name) : 'Matunga Rd.';
          window.stopsNotifEngine.onArrived(curr, prev, next);
        } else {
          const prev = currentJourneyStops[livePos.fromIdx]?.station?.station_name || currentJourneyStops[livePos.fromIdx]?.station_name || 'Prabhadevi';
          const curr = currentJourneyStops[livePos.fromIdx]?.station?.station_name || currentJourneyStops[livePos.fromIdx]?.station_name || 'Dadar';
          const next = currentJourneyStops[livePos.toIdx]?.station?.station_name || currentJourneyStops[livePos.toIdx]?.station_name || 'Matunga Rd.';
          window.stopsNotifEngine.onInBetween(prev, curr, next);
        }
      }
    } else {
      // Continuous smooth live gliding of the capsule along the track between stations
      const orangeCapsule = document.querySelector('.train-capsule-orange');
      const trackLine = document.querySelector('.between-track-line');
      const betweenText = document.querySelector('.between-text');

      if (orangeCapsule) {
        const topP = livePos.topPercent || 50;
        orangeCapsule.style.top = `${topP}%`;

        // Smooth transition to green when touching dot, and orange when leaving dot
        const isGreen = Boolean(livePos.isTouchingDot);
        orangeCapsule.classList.toggle('is-green', isGreen);
        orangeCapsule.classList.toggle('is-orange', !isGreen);

        if (trackLine) {
          trackLine.style.background = `linear-gradient(180deg, #A855F7 0%, #A855F7 ${topP}%, rgba(255, 255, 255, 0.22) ${topP}%, rgba(255, 255, 255, 0.22) 100%)`;
        }

        if (betweenText) {
          betweenText.textContent = isGreen ? 'Arriving' : 'Between';
          betweenText.classList.toggle('is-arriving', isGreen);
        }

        // Highlight station dot when capsule touches it
        document.querySelectorAll('.stop-dot').forEach((dot, dotIdx) => {
          dot.classList.toggle('is-touched', isGreen && livePos.stationIdx === dotIdx);
        });
      }
    }
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

    // 1. Header Train Name (Center)
    const trainNameEl = document.getElementById('journeyTrainName');
    if (trainNameEl) {
      trainNameEl.textContent = `${originName} - ${termName}`;
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

    if (!stops || stops.length === 0) {
      stops = generateFallbackStopsForTrain(trainItem);
    }

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
  if (timetableContainer) {
    timetableContainer.addEventListener('scroll', () => syncScrollIndicator(timetableContainer));
  }

});

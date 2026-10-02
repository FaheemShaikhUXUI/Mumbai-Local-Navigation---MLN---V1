// Mumbai Local Timetable Admin Dashboard Controller

async function loadStatus() {
  try {
    const res = await fetch('/api/sync/status');
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('engineStatusText').textContent = data.status || 'SYNC_IDLE';
    const enginePill = document.getElementById('engineStatusPill');
    if (data.status === 'SYNC_SUCCESS' || data.status === 'SYNC_IDLE') {
      enginePill.className = 'pill pill-success';
    } else if (data.status === 'SYNC_CHECKING' || data.status === 'PARSING') {
      enginePill.className = 'pill pill-warning';
    } else {
      enginePill.className = 'pill pill-danger';
    }

    if (data.currentVersion) {
      document.getElementById('activeVersionText').textContent = data.currentVersion;
    }

    if (data.lastCheckedAt) {
      const dt = new Date(data.lastCheckedAt);
      document.getElementById('sourceDetails').textContent = `Last checked: ${dt.toLocaleTimeString()} (every 6 hrs)`;
    }

    // Render Logs
    const logsContainer = document.getElementById('logsContainer');
    if (data.recentLogs && data.recentLogs.length > 0) {
      logsContainer.innerHTML = data.recentLogs
        .map((log) => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          return `
            <div class="log-item">
              <div class="log-time">${time}</div>
              <div class="log-body">
                <div class="log-source">${log.source} &bull; <span class="tag ${log.status === 'SYNC_SUCCESS' ? 'tag-slow' : 'tag-fast'}">${log.status}</span></div>
                <div class="log-msg">${log.message}</div>
              </div>
            </div>
          `;
        })
        .join('');
      document.getElementById('logCountPill').textContent = `${data.recentLogs.length} events`;
    }
  } catch (err) {
    console.error('Failed to load status:', err);
  }
}

async function loadManifest() {
  try {
    const res = await fetch('/api/timetable/manifest');
    if (res.ok) {
      const manifest = await res.json();
      if (manifest.latestVersion) {
        document.getElementById('activeVersionText').textContent = manifest.latestVersion;
        document.getElementById('effectiveDateText').textContent = `Effective: ${manifest.effectiveDate || '01.09.2026'}`;
      }
      if (manifest.availablePatches && manifest.availablePatches.length > 0) {
        const patch = manifest.availablePatches[0];
        document.getElementById('patchSizeValue').textContent = `${patch.patchSizeBytes} Bytes`;
      }
    }
  } catch (err) {
    console.error('Failed to load manifest:', err);
  }
}

async function loadLines() {
  try {
    const res = await fetch('/api/lines');
    if (res.ok) {
      const lines = await res.json();
      const container = document.getElementById('linesList');
      container.innerHTML = lines
        .map(
          (l) => `
        <div style="background: rgba(30, 41, 59, 0.5); padding: 0.75rem; border-radius: 8px; border-left: 4px solid ${l.color};">
          <div style="font-weight: 700; font-size: 0.9rem;">${l.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.2rem;">Code: ${l.code}</div>
        </div>
      `
        )
        .join('');
    }
  } catch (err) {
    console.error('Failed to load lines:', err);
  }
}

function showAlert(message, type = 'success') {
  const alertEl = document.getElementById('statusAlert');
  alertEl.style.display = 'block';
  alertEl.textContent = message;
  if (type === 'success') {
    alertEl.style.background = 'rgba(16, 185, 129, 0.2)';
    alertEl.style.color = '#34D399';
    alertEl.style.border = '1px solid rgba(16, 185, 129, 0.3)';
  } else if (type === 'danger') {
    alertEl.style.background = 'rgba(239, 68, 68, 0.2)';
    alertEl.style.color = '#F87171';
    alertEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
  } else {
    alertEl.style.background = 'rgba(59, 130, 246, 0.2)';
    alertEl.style.color = '#60A5FA';
    alertEl.style.border = '1px solid rgba(59, 130, 246, 0.3)';
  }
  setTimeout(() => {
    alertEl.style.display = 'none';
  }, 6000);
}

// Action Event Handlers
document.getElementById('btnSyncNow').addEventListener('click', async () => {
  showAlert('Triggering official source synchronization pipeline...', 'info');
  try {
    const res = await fetch('/api/sync/trigger', { method: 'POST' });
    const data = await res.json();
    showAlert(`Sync complete: ${data.status}. Version: ${data.version || 'Unchanged'}`);
    loadStatus();
    loadManifest();
  } catch (err) {
    showAlert(`Sync failed: ${err.message}`, 'danger');
  }
});

document.getElementById('btnSimulateUpdate').addEventListener('click', async () => {
  showAlert('Simulating Section 35 update scenario (Kalyan 07:20 -> 07:23)...', 'info');
  try {
    const res = await fetch('/api/sync/simulate', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showAlert(`Section 35 update published: ${data.modifiedVersion} (Patch size: ${data.patchSizeBytes} bytes)`, 'success');
      loadStatus();
      loadManifest();
    } else {
      showAlert(`Simulation failed: ${data.error}`, 'danger');
    }
  } catch (err) {
    showAlert(`Simulation error: ${err.message}`, 'danger');
  }
});

document.getElementById('btnRollbackTest').addEventListener('click', async () => {
  showAlert('Running Section 36 Rollback test with corrupted update payload...', 'info');
  try {
    const res = await fetch('/api/sync/rollback-test', { method: 'POST' });
    const data = await res.json();
    if (data.testResult && data.testResult.rollbackApplied) {
      showAlert(`Rollback successful! Error caught: "${data.testResult.error}". Database version safely preserved at ${data.activeVersionAfterTest}.`, 'success');
    } else {
      showAlert(`Rollback test failed!`, 'danger');
    }
    loadStatus();
  } catch (err) {
    showAlert(`Rollback test error: ${err.message}`, 'danger');
  }
});

document.getElementById('btnRefresh').addEventListener('click', () => {
  loadStatus();
  loadManifest();
  loadLines();
  showAlert('Dashboard refreshed.', 'info');
});

document.getElementById('btnSwapStations').addEventListener('click', () => {
  const fromEl = document.getElementById('fromStationInput');
  const toEl = document.getElementById('toStationInput');
  const temp = fromEl.value;
  fromEl.value = toEl.value;
  toEl.value = temp;
});

// Train Search Handler
document.getElementById('btnSearchTrains').addEventListener('click', async () => {
  const fromName = document.getElementById('fromStationInput').value.trim();
  const toName = document.getElementById('toStationInput').value.trim();
  const trainType = document.getElementById('trainTypeSelect').value;

  if (!fromName || !toName) {
    alert('Please specify both From and To stations');
    return;
  }

  const resultsContainer = document.getElementById('trainResultsList');
  resultsContainer.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 2rem;">Searching local database...</div>';

  try {
    // 1. Resolve From station
    const fromRes = await fetch(`/api/stations?q=${encodeURIComponent(fromName)}`);
    const fromStations = await fromRes.json();
    if (!fromStations.length) {
      resultsContainer.innerHTML = `<div style="color: #F87171; text-align: center; padding: 2rem;">From station "${fromName}" not found.</div>`;
      return;
    }
    const fromId = fromStations[0].station.id;

    // 2. Resolve To station
    const toRes = await fetch(`/api/stations?q=${encodeURIComponent(toName)}`);
    const toStations = await toRes.json();
    if (!toStations.length) {
      resultsContainer.innerHTML = `<div style="color: #F87171; text-align: center; padding: 2rem;">To station "${toName}" not found.</div>`;
      return;
    }
    const toId = toStations[0].station.id;

    // 3. Search trains
    const trainsRes = await fetch(`/api/trains?from=${fromId}&to=${toId}&type=${trainType}`);
    const trains = await trainsRes.json();

    if (!trains.length) {
      resultsContainer.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 2rem;">No direct trains found between ${fromStations[0].station.station_name} and ${toStations[0].station.station_name}.</div>`;
      return;
    }

    resultsContainer.innerHTML = trains
      .map(
        (t) => `
      <div class="train-card">
        <div class="train-meta">
          <div class="line-indicator" style="background-color: ${t.line.color};"></div>
          <div>
            <div class="train-title">${t.train.train_number} &bull; ${t.train.train_name}</div>
            <div class="train-tags">
              <span class="tag ${t.train.train_type.includes('FAST') ? 'tag-fast' : 'tag-slow'}">${t.train.train_type}</span>
              <span class="tag">${t.stopsCount} Stops</span>
              <span class="tag">${t.line.name}</span>
            </div>
          </div>
        </div>
        <div class="train-timing">
          <div class="train-time">${t.departureTime.slice(0, 5)} &rarr; ${t.arrivalTime.slice(0, 5)}</div>
          <div class="train-duration">${t.durationMinutes} mins</div>
        </div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    resultsContainer.innerHTML = `<div style="color: #F87171; text-align: center; padding: 2rem;">Error: ${err.message}</div>`;
  }
});

// Initial boot
loadStatus();
loadManifest();
loadLines();
setInterval(loadStatus, 15000);

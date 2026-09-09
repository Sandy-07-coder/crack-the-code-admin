const screens = {};
document.querySelectorAll('.screen').forEach(s => screens[s.id] = s);
function showScreen(id) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[id].classList.add('active');
}

const state = {
  adminKey: sessionStorage.getItem('ctc_adminKey') || null,
  teams: [],
  event: null,
  sets: [],
  timers: {}
};

let socket = null;

async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.adminKey) headers['x-admin-key'] = state.adminKey;
  const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- Login ----------

document.getElementById('login-btn').addEventListener('click', async () => {
  const key = document.getElementById('admin-key-input').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    await fetch(API_BASE + '/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey: key })
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Login failed'); });
    state.adminKey = key;
    sessionStorage.setItem('ctc_adminKey', key);
    boot();
  } catch (e) {
    errEl.textContent = e.message;
  }
});

if (state.adminKey) boot(); else showScreen('screen-login');

async function boot() {
  showScreen('screen-dashboard');
  connectSocket();
  await Promise.all([loadTeams(), loadEvent()]);
  renderRoundControls();
}

function connectSocket() {
  socket = io(API_BASE);
  socket.emit('admin-subscribe', { adminKey: state.adminKey });
  socket.on('team-joined', team => {
    if (!state.teams.find(t => t.id === team.id)) state.teams.push(team);
    renderTeams();
  });
  socket.on('leaderboard-update', renderLeaderboard);
  socket.on('round-released', () => { loadEvent().then(renderRoundControls); });
  socket.on('round-closed', () => { loadEvent().then(renderRoundControls); });
}

// ---------- Data loading ----------

async function loadTeams() {
  state.teams = await api('/api/admin/teams');
  renderTeams();
}

async function loadEvent() {
  const data = await api('/api/admin/event');
  state.event = data.event;
  state.sets = data.sets;
  document.getElementById('duration-input').value = state.event.roundDurationMinutes;
  renderSetsUI();
}

// ---------- Generate / select sets ----------

document.getElementById('generate-sets-btn').addEventListener('click', async () => {
  const apiKey = document.getElementById('gemini-key-input').value.trim();
  const statusEl = document.getElementById('generate-status');
  statusEl.textContent = 'Generating 5 challenge sets... this can take up to a minute.';
  try {
    const data = await api('/api/admin/generate-sets', { method: 'POST', body: JSON.stringify({ apiKey, count: 5 }) });
    statusEl.textContent = data.warning ? `⚠️ ${data.warning}` : `✅ Generated ${data.sets.length} sets.`;
    state.sets = data.sets;
    renderSetsUI();
  } catch (e) {
    statusEl.textContent = `❌ ${e.message}`;
  }
});

function renderSetsUI() {
  const select = document.getElementById('set-select');
  select.innerHTML = '<option value="">-- choose a generated set --</option>' +
    state.sets.map(s => `<option value="${s.id}" ${state.event?.activeSetId === s.id ? 'selected' : ''}>${s.label} (${s.source})</option>`).join('');
  document.getElementById('sets-list').innerHTML = state.sets.map(s => `<div>• ${s.label} — source: ${s.source}</div>`).join('');
  const activeStatus = document.getElementById('active-set-status');
  activeStatus.textContent = state.event?.activeSetId ? `Active set: ${state.event.activeSetId}` : 'No set selected yet.';
}

document.getElementById('select-set-btn').addEventListener('click', async () => {
  const setId = document.getElementById('set-select').value;
  if (!setId) return;
  await api('/api/admin/select-set', { method: 'POST', body: JSON.stringify({ setId }) });
  await loadEvent();
});

document.getElementById('set-duration-btn').addEventListener('click', async () => {
  const minutes = Number(document.getElementById('duration-input').value);
  await api('/api/admin/set-duration', { method: 'POST', body: JSON.stringify({ minutes }) });
  await loadEvent();
});

// ---------- Round control ----------

const ROUND_NAMES = { 1: '🧠 AI Intelligence', 2: '💻 Code Breaker', 3: '⚔️ Rival Zone', 4: '🔐 Final Vault' };

function renderRoundControls() {
  const container = document.getElementById('round-controls');
  container.innerHTML = '';
  Object.keys(state.timers).forEach(k => clearInterval(state.timers[k]));

  for (const r of [1, 2, 3, 4]) {
    const info = state.event.rounds[r];
    const card = document.createElement('div');
    card.className = 'round-card';
    card.innerHTML = `
      <h4>${ROUND_NAMES[r]}</h4>
      <div class="rstatus" id="rstatus-${r}">${roundStatusText(info)}</div>
      <button class="small" data-round="${r}" ${info.released ? 'disabled' : ''}>${info.released ? 'Released' : 'Release'}</button>
      ${info.released && !isRoundOver(info) ? `<button class="small danger-btn" data-close="${r}">Close Now</button>` : ''}
    `;
    container.appendChild(card);
  }

  container.querySelectorAll('button[data-round]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = btn.dataset.round;
      if (!state.event.activeSetId) { alert('Select an active challenge set first.'); return; }
      await api('/api/admin/release-round', { method: 'POST', body: JSON.stringify({ round: Number(r) }) });
      await loadEvent();
      renderRoundControls();
    });
  });
  container.querySelectorAll('button[data-close]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = btn.dataset.close;
      if (!confirm(`Close Round ${r} now for all teams?`)) return;
      await api('/api/admin/close-round', { method: 'POST', body: JSON.stringify({ round: Number(r) }) });
      await loadEvent();
      renderRoundControls();
    });
  });

  // live countdowns
  for (const r of [1, 2, 3, 4]) {
    const info = state.event.rounds[r];
    if (info.released && !isRoundOver(info)) {
      state.timers[r] = setInterval(() => {
        const el = document.getElementById(`rstatus-${r}`);
        if (el) el.textContent = roundStatusText(state.event.rounds[r]);
        if (isRoundOver(state.event.rounds[r])) clearInterval(state.timers[r]);
      }, 1000);
    }
  }
}

function isRoundOver(info) {
  return info.released && info.endTime && Date.now() > info.endTime;
}
function roundStatusText(info) {
  if (!info.released) return 'Not released yet';
  if (isRoundOver(info)) return 'Round closed';
  const remaining = Math.max(0, info.endTime - Date.now());
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return `⏱ Live — ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} left`;
}

// ---------- Teams ----------

function renderTeams() {
  document.getElementById('team-count').textContent = state.teams.length;
  document.getElementById('teams-list').innerHTML = state.teams
    .slice().sort((a, b) => a.joinedAt - b.joinedAt)
    .map(t => `<li><span>${escapeHtml(t.name)}</span><span class="muted">${new Date(t.joinedAt).toLocaleTimeString()}</span></li>`)
    .join('') || '<li class="muted">No teams have joined yet.</li>';

  const manualSelect = document.getElementById('manual-team-select');
  manualSelect.innerHTML = state.teams.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('') || '<option value="">-- no teams --</option>';
}

// ---------- Manual scoring ----------

document.getElementById('manual-award-btn').addEventListener('click', async () => {
  const teamId = document.getElementById('manual-team-select').value;
  const round = document.getElementById('manual-round-select').value;
  const points = Number(document.getElementById('manual-points-input').value);
  const reason = document.getElementById('manual-reason-input').value;
  const statusEl = document.getElementById('manual-status');
  if (!teamId) { statusEl.textContent = 'No team selected.'; return; }
  try {
    await api('/api/admin/manual-score', { method: 'POST', body: JSON.stringify({ teamId, round, points, reason }) });
    statusEl.textContent = `✅ Awarded ${points} pts to team for Round ${round}.`;
  } catch (e) {
    statusEl.textContent = `❌ ${e.message}`;
  }
});

// ---------- Leaderboard ----------

function renderLeaderboard(rows) {
  const tbody = document.querySelector('#leaderboard-table tbody');
  tbody.innerHTML = rows.map((row, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(row.teamName)}</td>
      <td>${row.roundScores[1].score}</td>
      <td>${row.roundScores[2].score}</td>
      <td>${row.roundScores[3].score}</td>
      <td>${row.roundScores[4].score}</td>
      <td><b>${row.totalScore}</b></td>
      <td>${formatMs(row.totalTimeMs)}</td>
    </tr>
  `).join('') || `<tr><td colspan="8" class="muted">No submissions yet.</td></tr>`;
}

function formatMs(ms) {
  if (!ms) return '—';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

// ---------- Reset ----------

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('This wipes ALL teams, submissions and scores. Continue?')) return;
  await api('/api/admin/reset', { method: 'POST' });
  state.teams = [];
  await loadEvent();
  renderTeams();
  renderRoundControls();
  renderLeaderboard([]);
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// refresh event/round display periodically as a safety net
setInterval(() => { if (state.adminKey && state.event) loadEvent(); }, 15000);

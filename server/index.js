require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');

const db = require('./db');
const { generateChallengeSets, fallbackSets } = require('./gemini');
const { scoreSubmission } = require('./scoring');

const PORT = process.env.PORT || 4000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123'; // change in .env for real events
const ROUND_DURATION_MS = () => (db.get('event.roundDurationMinutes').value() || 30) * 60 * 1000;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Convenience: serve the participant & admin front-ends directly from this
// server so the whole event can run from one process (optional — you can
// also host /participant and /admin separately on any static file host).
const path = require('path');
app.use('/play', express.static(path.join(__dirname, '..', 'participant')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// ---------- helpers ----------

function requireAdmin(req, res, next) {
  const key = req.header('x-admin-key');
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key' });
  next();
}

function requireTeam(req, res, next) {
  const token = req.header('x-team-token');
  const team = db.get('teams').find({ token }).value();
  if (!team) return res.status(401).json({ error: 'Invalid or missing team token' });
  req.team = team;
  next();
}

function activeChallengeSet() {
  const activeSetId = db.get('event.activeSetId').value();
  if (!activeSetId) return null;
  return db.get('sets').find({ id: activeSetId }).value();
}

function publicRoundInfo() {
  const event = db.get('event').value();
  const now = Date.now();
  const rounds = {};
  for (const r of [1, 2, 3, 4]) {
    const info = event.rounds[r];
    rounds[r] = {
      released: info.released,
      startTime: info.startTime,
      endTime: info.endTime,
      timeRemainingMs: info.released && info.endTime ? Math.max(0, info.endTime - now) : null
    };
  }
  return { currentRound: event.currentRound, roundDurationMinutes: event.roundDurationMinutes, rounds };
}

/** Sanitizes a challenge round for participants (never leak correct answers). */
function participantSafeRound(set, round) {
  if (!set) return null;
  if (round === 1) {
    return set.round1.map(q => ({ id: q.id, question: q.question, options: q.options, points: q.points }));
  }
  if (round === 2) {
    return set.round2.map(q => ({ id: q.id, title: q.title, prompt: q.prompt, codeTemplate: q.codeTemplate, points: q.points }));
  }
  if (round === 3) {
    return set.round3PowerChallenges || [];
  }
  if (round === 4) {
    return {
      stage1: { instructions: set.round4.stage1.instructions, cipherText: set.round4.stage1.cipherText },
      stage2: { instructions: set.round4.stage2.instructions, cipherText: set.round4.stage2.cipherText },
      finalInstructions: set.round4.finalInstructions
    };
  }
  return null;
}

function computeLeaderboard() {
  const teams = db.get('teams').value();
  const submissions = db.get('submissions').value();
  const manualAdjustments = db.get('manualAdjustments').value();

  return teams
    .map(team => {
      const teamSubs = submissions.filter(s => s.teamId === team.id);
      const teamManual = manualAdjustments.filter(m => m.teamId === team.id);
      const roundScores = {};
      let totalScore = 0;
      let totalTimeMs = 0;
      for (const r of [1, 2, 3, 4]) {
        const sub = teamSubs.find(s => s.round === r);
        const manualForRound = teamManual.filter(m => m.round === r).reduce((s, m) => s + m.points, 0);
        const autoScore = sub ? sub.score : 0;
        roundScores[r] = {
          score: autoScore + manualForRound,
          timeMs: sub ? sub.completionTimeMs : null,
          submitted: !!sub
        };
        totalScore += autoScore + manualForRound;
        if (sub) totalTimeMs += sub.completionTimeMs;
      }
      return {
        teamId: team.id,
        teamName: team.name,
        roundScores,
        totalScore,
        totalTimeMs
      };
    })
    .sort((a, b) => (b.totalScore - a.totalScore) || (a.totalTimeMs - b.totalTimeMs));
}

function broadcastLeaderboard() {
  io.to('admin-room').emit('leaderboard-update', computeLeaderboard());
}

// ---------- TEAM (participant) routes ----------

app.post('/api/team/join', (req, res) => {
  const { teamName } = req.body;
  if (!teamName || !teamName.trim()) return res.status(400).json({ error: 'Team name is required' });

  const existing = db.get('teams').find({ name: teamName.trim() }).value();
  if (existing) return res.status(409).json({ error: 'A team with that name already joined' });

  const team = {
    id: nanoid(8),
    name: teamName.trim(),
    token: nanoid(24),
    joinedAt: Date.now()
  };
  db.get('teams').push(team).write();

  // Only broadcast to the admin room — participants never see the roster.
  io.to('admin-room').emit('team-joined', { id: team.id, name: team.name, joinedAt: team.joinedAt });
  broadcastLeaderboard();

  res.json({ teamId: team.id, teamToken: team.token, teamName: team.name });
});

app.get('/api/team/state', requireTeam, (req, res) => {
  const info = publicRoundInfo();
  const set = activeChallengeSet();
  const mySubmissions = db.get('submissions').filter({ teamId: req.team.id }).value();
  res.json({
    team: { id: req.team.id, name: req.team.name },
    event: info,
    setSelected: !!set,
    mySubmissions: mySubmissions.map(s => ({ round: s.round, score: s.score, completionTimeMs: s.completionTimeMs }))
  });
});

app.get('/api/team/round/:round', requireTeam, (req, res) => {
  const round = Number(req.params.round);
  const event = db.get('event').value();
  const roundInfo = event.rounds[round];
  if (!roundInfo || !roundInfo.released) {
    return res.status(403).json({ error: 'This round has not been released yet' });
  }
  const set = activeChallengeSet();
  if (!set) return res.status(400).json({ error: 'No challenge set has been selected by the admin yet' });

  const already = db.get('submissions').find({ teamId: req.team.id, round }).value();
  res.json({
    round,
    startTime: roundInfo.startTime,
    endTime: roundInfo.endTime,
    challenge: participantSafeRound(set, round),
    alreadySubmitted: !!already
  });
});

app.post('/api/team/submit', requireTeam, (req, res) => {
  const { round, answers } = req.body;
  const r = Number(round);
  if (![1, 2, 3, 4].includes(r)) return res.status(400).json({ error: 'Invalid round' });

  const event = db.get('event').value();
  const roundInfo = event.rounds[r];
  if (!roundInfo.released) return res.status(403).json({ error: 'Round not released' });

  const already = db.get('submissions').find({ teamId: req.team.id, round: r }).value();
  if (already) return res.status(409).json({ error: 'You already submitted this round', score: already.score });

  const now = Date.now();
  if (roundInfo.endTime && now > roundInfo.endTime) {
    return res.status(403).json({ error: 'Time is up for this round' });
  }

  const set = activeChallengeSet();
  if (!set) return res.status(400).json({ error: 'No active challenge set' });

  let result;
  if (r === 3) {
    // Round 3 (Rival Zone) is scored live/manually by the admin via power-ups.
    // We still record a "submission" so completion time is captured for tie-breaks.
    result = { score: 0, maxScore: null, breakdown: null };
  } else {
    try {
      result = scoreSubmission(r, set, answers);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  const completionTimeMs = now - roundInfo.startTime;
  const submission = {
    id: nanoid(8),
    teamId: req.team.id,
    round: r,
    answers,
    score: result.score,
    maxScore: result.maxScore,
    completionTimeMs,
    submittedAt: now
  };
  db.get('submissions').push(submission).write();
  broadcastLeaderboard();

  res.json({
    score: result.score,
    maxScore: result.maxScore,
    completionTimeMs,
    breakdown: result.breakdown
  });
});

// ---------- ADMIN routes ----------

app.post('/api/admin/login', (req, res) => {
  const { adminKey } = req.body;
  if (adminKey !== ADMIN_KEY) return res.status(401).json({ error: 'Wrong admin key' });
  res.json({ ok: true });
});

app.get('/api/admin/teams', requireAdmin, (req, res) => {
  res.json(db.get('teams').map(t => ({ id: t.id, name: t.name, joinedAt: t.joinedAt })).value());
});

app.get('/api/admin/event', requireAdmin, (req, res) => {
  res.json({ event: db.get('event').value(), sets: db.get('sets').map(s => ({ id: s.id, label: s.label, source: s.source })).value() });
});

app.post('/api/admin/generate-sets', requireAdmin, async (req, res) => {
  const { apiKey, count } = req.body;
  const n = count || 5;
  const keyToUse = apiKey || process.env.GEMINI_API_KEY;
  try {
    let sets;
    if (keyToUse) {
      sets = await generateChallengeSets(keyToUse, n);
    } else {
      sets = fallbackSets(n);
    }
    db.set('sets', sets).write();
    res.json({ ok: true, sets: sets.map(s => ({ id: s.id, label: s.label, source: s.source })) });
  } catch (e) {
    console.error('Gemini generation failed, using fallback sets:', e.message);
    const sets = fallbackSets(n);
    db.set('sets', sets).write();
    res.status(200).json({
      ok: true,
      warning: `Gemini API call failed (${e.message}). Used offline fallback sets instead.`,
      sets: sets.map(s => ({ id: s.id, label: s.label, source: s.source }))
    });
  }
});

app.post('/api/admin/select-set', requireAdmin, (req, res) => {
  const { setId } = req.body;
  const set = db.get('sets').find({ id: setId }).value();
  if (!set) return res.status(404).json({ error: 'Set not found' });
  db.set('event.activeSetId', setId).write();
  res.json({ ok: true, activeSetId: setId });
});

app.post('/api/admin/set-duration', requireAdmin, (req, res) => {
  const { minutes } = req.body;
  if (!minutes || minutes <= 0) return res.status(400).json({ error: 'Invalid duration' });
  db.set('event.roundDurationMinutes', minutes).write();
  res.json({ ok: true });
});

app.post('/api/admin/release-round', requireAdmin, (req, res) => {
  const { round } = req.body;
  const r = Number(round);
  if (![1, 2, 3, 4].includes(r)) return res.status(400).json({ error: 'Invalid round' });
  if (!db.get('event.activeSetId').value()) return res.status(400).json({ error: 'Select a challenge set first' });

  const now = Date.now();
  const durationMs = ROUND_DURATION_MS();
  db.set(`event.rounds.${r}.released`, true)
    .set(`event.rounds.${r}.startTime`, now)
    .set(`event.rounds.${r}.endTime`, now + durationMs)
    .set('event.currentRound', r)
    .write();

  io.emit('round-released', { round: r, startTime: now, endTime: now + durationMs });
  broadcastLeaderboard();
  res.json({ ok: true, round: r, startTime: now, endTime: now + durationMs });
});

app.post('/api/admin/close-round', requireAdmin, (req, res) => {
  const { round } = req.body;
  const r = Number(round);
  db.set(`event.rounds.${r}.endTime`, Date.now()).write();
  io.emit('round-closed', { round: r });
  broadcastLeaderboard();
  res.json({ ok: true });
});

// Manual scoring — primarily for Round 3 (Rival Zone: Shield/Scanner/Boost/Trap)
app.post('/api/admin/manual-score', requireAdmin, (req, res) => {
  const { teamId, round, points, reason } = req.body;
  const team = db.get('teams').find({ id: teamId }).value();
  if (!team) return res.status(404).json({ error: 'Team not found' });

  db.get('manualAdjustments').push({
    id: nanoid(8),
    teamId,
    round: Number(round),
    points: Number(points),
    reason: reason || '',
    at: Date.now()
  }).write();

  broadcastLeaderboard();
  res.json({ ok: true });
});

app.get('/api/admin/leaderboard', requireAdmin, (req, res) => {
  res.json(computeLeaderboard());
});

app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  res.json(db.get('submissions').value());
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  db.set('teams', []).write();
  db.set('submissions', []).write();
  db.set('manualAdjustments', []).write();
  db.set('event', {
    activeSetId: null,
    roundDurationMinutes: 30,
    currentRound: 0,
    rounds: {
      1: { released: false, startTime: null, endTime: null },
      2: { released: false, startTime: null, endTime: null },
      3: { released: false, startTime: null, endTime: null },
      4: { released: false, startTime: null, endTime: null }
    }
  }).write();
  io.emit('event-reset');
  res.json({ ok: true });
});

// ---------- Socket.IO ----------

io.on('connection', socket => {
  socket.on('admin-subscribe', ({ adminKey }) => {
    if (adminKey === ADMIN_KEY) {
      socket.join('admin-room');
      socket.emit('leaderboard-update', computeLeaderboard());
    }
  });
});

server.listen(PORT, () => {
  console.log(`Crack the Code server running on port ${PORT}`);
  console.log(`Admin key: ${ADMIN_KEY} (set ADMIN_KEY in .env to change)`);
});


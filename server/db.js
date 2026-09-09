const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db = low(adapter);

// Default schema
db.defaults({
  // Teams, visible in full only to admin. Participants only know their own token.
  teams: [],
  // 5 pre-generated challenge sets. Each set = { id, source, round1:[...], round2:[...], round4:{...} }
  sets: [],
  // Event / control state
  event: {
    activeSetId: null,
    roundDurationMinutes: 30,
    currentRound: 0, // 0 = not started, 1-4 = active/finished round
    rounds: {
      1: { released: false, startTime: null, endTime: null },
      2: { released: false, startTime: null, endTime: null },
      3: { released: false, startTime: null, endTime: null },
      4: { released: false, startTime: null, endTime: null }
    }
  },
  // One submission record per team per round
  submissions: [],
  // Manual score adjustments (used mainly for Round 3 - Rival Zone)
  manualAdjustments: []
}).write();

module.exports = db;

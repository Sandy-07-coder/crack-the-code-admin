import { useState } from 'react';
import { api } from '../config';

export default function ManualScoringPanel({ adminKey, teams }) {
  const [teamId, setTeamId] = useState('');
  const [round, setRound] = useState('3');
  const [points, setPoints] = useState(10);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');

  const handleAward = async () => {
    if (!teamId) { setStatus('No team selected.'); return; }
    try {
      await api('/api/admin/manual-score', { 
        method: 'POST', 
        body: JSON.stringify({ teamId, round, points: Number(points), reason }) 
      }, adminKey);
      setStatus(`✅ Awarded ${points} pts to team for Round ${round}.`);
      setPoints(10);
      setReason('');
    } catch (e) {
      setStatus(`❌ ${e.message}`);
    }
  };

  return (
    <div className="panel">
      <h3>⚔️ Manual Scoring — Rival Zone</h3>
      <p className="muted">Award or deduct points live during Round 3 (Shield / Scanner / Boost / Trap).</p>
      <select value={teamId} onChange={e => setTeamId(e.target.value)}>
        <option value="">-- select team --</option>
        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <select value={round} onChange={e => setRound(e.target.value)}>
        <option value="3">Round 3 — Rival Zone</option>
        <option value="1">Round 1</option>
        <option value="2">Round 2</option>
        <option value="4">Round 4</option>
      </select>
      <input 
        type="number" 
        placeholder="Points (+/-)" 
        value={points} 
        onChange={e => setPoints(e.target.value)} 
      />
      <input 
        type="text" 
        placeholder="Reason (e.g. Shield used)" 
        value={reason} 
        onChange={e => setReason(e.target.value)} 
      />
      <button onClick={handleAward}>Award Points</button>
      <div className="status">{status}</div>
    </div>
  );
}

import { useState } from 'react';
import { api } from '../config';

export default function ChallengeSetsPanel({ adminKey, event, sets, onRefresh }) {
  const [geminiKey, setGeminiKey] = useState('');
  const [status, setStatus] = useState('');
  const [selectedSet, setSelectedSet] = useState('');
  const [duration, setDuration] = useState(event?.roundDurationMinutes || 30);

  const handleGenerate = async () => {
    setStatus('Generating 5 challenge sets... this can take up to a minute.');
    try {
      const data = await api('/api/admin/generate-sets', {
        method: 'POST',
        body: JSON.stringify({ apiKey: geminiKey, count: 5 })
      }, adminKey);
      setStatus(data.warning ? `⚠️ ${data.warning}` : `✅ Generated ${data.sets.length} sets.`);
      onRefresh();
    } catch (e) {
      setStatus(`❌ ${e.message}`);
    }
  };

  const handleSelectSet = async () => {
    if (!selectedSet) return;
    try {
      await api('/api/admin/select-set', {
        method: 'POST',
        body: JSON.stringify({ setId: selectedSet })
      }, adminKey);
      onRefresh();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleSetDuration = async () => {
    try {
      await api('/api/admin/set-duration', {
        method: 'POST',
        body: JSON.stringify({ minutes: Number(duration) })
      }, adminKey);
      onRefresh();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <>
      <div className="panel">
        <h3>1. Generate Challenge Sets</h3>
        <p className="muted">Generates 5 distinct challenge sets (Rounds 1, 2 & 4) using Gemini. Leave the API key blank to use offline sample sets instead.</p>
        <input 
          type="password" 
          placeholder="Gemini API key (optional)" 
          value={geminiKey}
          onChange={e => setGeminiKey(e.target.value)}
        />
        <button onClick={handleGenerate}>Generate 5 Sets</button>
        <div className="status">{status}</div>
        <div className="sets-list">
          {sets.map(s => <div key={s.id}>• {s.label} — source: {s.source}</div>)}
        </div>
      </div>

      <div className="panel">
        <h3>2. Select Active Set &amp; Timer</h3>
        <select 
          value={selectedSet} 
          onChange={e => setSelectedSet(e.target.value)}
        >
          <option value="">-- choose a generated set --</option>
          {sets.map(s => (
            <option key={s.id} value={s.id}>{s.label} ({s.source})</option>
          ))}
        </select>
        <button onClick={handleSelectSet}>Use This Set</button>
        <div className="status">
          {event?.activeSetId ? `Active set: ${event.activeSetId}` : 'No set selected yet.'}
        </div>
        <hr/>
        <label className="muted">Round duration (minutes)</label>
        <input 
          type="number" 
          value={duration} 
          min="1"
          onChange={e => setDuration(e.target.value)}
        />
        <button onClick={handleSetDuration}>Update Duration</button>
      </div>
    </>
  );
}

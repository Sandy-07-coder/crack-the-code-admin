import { useEffect, useState } from 'react';
import { api } from '../config';

const ROUND_NAMES = { 1: '🧠 AI Intelligence', 2: '💻 Code Breaker', 3: '⚔️ Rival Zone', 4: '🔐 Final Vault' };

export default function RoundControlPanel({ adminKey, event, onRefresh }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!event) return null;

  const isRoundOver = (info) => info.released && info.endTime && now > info.endTime;

  const roundStatusText = (info) => {
    if (!info.released) return 'Not released yet';
    if (isRoundOver(info)) return 'Round closed';
    const remaining = Math.max(0, info.endTime - now);
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return `⏱ Live — ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} left`;
  };

  const handleRelease = async (r) => {
    if (!event.activeSetId) { alert('Select an active challenge set first.'); return; }
    try {
      await api('/api/admin/release-round', { method: 'POST', body: JSON.stringify({ round: Number(r) }) }, adminKey);
      onRefresh();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleClose = async (r) => {
    if (!window.confirm(`Close Round ${r} now for all teams?`)) return;
    try {
      await api('/api/admin/close-round', { method: 'POST', body: JSON.stringify({ round: Number(r) }) }, adminKey);
      onRefresh();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="panel wide">
      <h3>3. Round Control</h3>
      <div className="round-controls">
        {[1, 2, 3, 4].map(r => {
          const info = event.rounds[r];
          return (
            <div key={r} className="round-card">
              <h4>{ROUND_NAMES[r]}</h4>
              <div className={`rstatus ${info.released && !isRoundOver(info) ? 'live' : ''} ${isRoundOver(info) ? 'done' : ''}`}>
                {roundStatusText(info)}
              </div>
              <button 
                className="small" 
                disabled={info.released}
                onClick={() => handleRelease(r)}
              >
                {info.released ? 'Released' : 'Release'}
              </button>
              {info.released && !isRoundOver(info) && (
                <button className="small danger-btn" onClick={() => handleClose(r)}>
                  Close Now
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

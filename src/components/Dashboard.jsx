import { api } from '../config';
import ChallengeSetsPanel from './ChallengeSetsPanel';
import RoundControlPanel from './RoundControlPanel';
import TeamsPanel from './TeamsPanel';
import ManualScoringPanel from './ManualScoringPanel';
import LeaderboardPanel from './LeaderboardPanel';

export default function Dashboard({ adminKey, event, sets, teams, leaderboard, onRefresh, onReset }) {
  const handleReset = async () => {
    if (!window.confirm('This wipes ALL teams, submissions and scores. Continue?')) return;
    try {
      await api('/api/admin/reset', { method: 'POST' }, adminKey);
      onReset();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <section id="screen-dashboard" className="screen active">
      <div className="dashboard">
        <header className="topbar">
          <h1>🔐 CRACK THE CODE — Admin</h1>
          <button className="danger-btn" onClick={handleReset}>Reset Event</button>
        </header>
        <div className="grid">
          <ChallengeSetsPanel 
            adminKey={adminKey} 
            event={event} 
            sets={sets} 
            onRefresh={onRefresh} 
          />
          <RoundControlPanel 
            adminKey={adminKey} 
            event={event} 
            onRefresh={onRefresh} 
          />
          <TeamsPanel 
            teams={teams} 
          />
          <ManualScoringPanel 
            adminKey={adminKey} 
            teams={teams} 
          />
          <LeaderboardPanel 
            leaderboard={leaderboard} 
          />
        </div>
      </div>
    </section>
  );
}

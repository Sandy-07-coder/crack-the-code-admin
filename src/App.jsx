import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { api, API_BASE } from './config';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';

export default function App() {
  const [adminKey, setAdminKey] = useState(sessionStorage.getItem('ctc_adminKey') || null);
  const [teams, setTeams] = useState([]);
  const [event, setEvent] = useState(null);
  const [sets, setSets] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [socket, setSocket] = useState(null);

  const loadTeams = async (key = adminKey) => {
    if (!key) return;
    try {
      const data = await api('/api/admin/teams', {}, key);
      setTeams(data);
    } catch (e) {
      console.error("Error loading teams", e);
    }
  };

  const loadEvent = async (key = adminKey) => {
    if (!key) return;
    try {
      const data = await api('/api/admin/event', {}, key);
      setEvent(data.event);
      setSets(data.sets);
    } catch (e) {
      console.error("Error loading event", e);
    }
  };

  const handleLogin = (key) => {
    sessionStorage.setItem('ctc_adminKey', key);
    setAdminKey(key);
  };

  const handleReset = () => {
    setTeams([]);
    setLeaderboard([]);
    loadEvent();
  };

  useEffect(() => {
    if (!adminKey) return;

    loadTeams();
    loadEvent();

    const newSocket = io(API_BASE);
    newSocket.emit('admin-subscribe', { adminKey });

    newSocket.on('team-joined', (team) => {
      setTeams(prev => {
        if (!prev.find(t => t.id === team.id)) return [...prev, team];
        return prev;
      });
    });

    newSocket.on('leaderboard-update', (rows) => {
      setLeaderboard(rows);
    });

    newSocket.on('round-released', () => {
      loadEvent();
    });

    newSocket.on('round-closed', () => {
      loadEvent();
    });

    setSocket(newSocket);

    // Auto refresh event logic
    const interval = setInterval(() => {
      loadEvent();
    }, 15000);

    return () => {
      clearInterval(interval);
      newSocket.disconnect();
    };
  }, [adminKey]);

  return (
    <div id="app">
      {!adminKey ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <Dashboard 
          adminKey={adminKey}
          event={event}
          sets={sets}
          teams={teams}
          leaderboard={leaderboard}
          onRefresh={loadEvent}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

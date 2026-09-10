import { useState } from 'react';
import { api } from '../config';

export default function LoginScreen({ onLogin }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ adminKey: key })
      });
      onLogin(key);
    } catch (e) {
      setError(e.message || 'Login failed');
    }
  };

  return (
    <section id="screen-login" className="screen active">
      <div className="card">
        <h1>🛠️ Admin Console</h1>
        <p className="sub">Crack the Code — Event Control Panel</p>
        <input 
          type="password" 
          placeholder="Admin key" 
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
        />
        <div className="error">{error}</div>
        <button onClick={handleLogin}>Log In</button>
      </div>
    </section>
  );
}

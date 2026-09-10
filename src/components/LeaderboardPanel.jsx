export default function LeaderboardPanel({ leaderboard }) {
  const formatMs = (ms) => {
    if (!ms) return '—';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="panel wide">
      <h3>🏆 Live Leaderboard</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>R1</th>
            <th>R2</th>
            <th>R3</th>
            <th>R4</th>
            <th>Total</th>
            <th>Total Time</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.length > 0 ? (
            leaderboard.map((row, idx) => (
              <tr key={row.teamId}>
                <td>{idx + 1}</td>
                <td>{row.teamName}</td>
                <td>{row.roundScores[1]?.score || 0}</td>
                <td>{row.roundScores[2]?.score || 0}</td>
                <td>{row.roundScores[3]?.score || 0}</td>
                <td>{row.roundScores[4]?.score || 0}</td>
                <td><b>{row.totalScore}</b></td>
                <td>{formatMs(row.totalTimeMs)}</td>
              </tr>
            ))
          ) : (
            <tr><td colSpan="8" className="muted" style={{textAlign: 'center'}}>No submissions yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function TeamsPanel({ teams }) {
  const sortedTeams = [...teams].sort((a, b) => a.joinedAt - b.joinedAt);

  return (
    <div className="panel">
      <h3>Teams Joined <span className="pill">{teams.length}</span></h3>
      <p className="muted">Only visible to you — participants can't see this list.</p>
      <ul className="teams-list">
        {sortedTeams.length > 0 ? (
          sortedTeams.map(t => (
            <li key={t.id}>
              <span>{t.name}</span>
              <span className="muted">{new Date(t.joinedAt).toLocaleTimeString()}</span>
            </li>
          ))
        ) : (
          <li className="muted">No teams have joined yet.</li>
        )}
      </ul>
    </div>
  );
}

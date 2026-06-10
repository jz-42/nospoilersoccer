import './App.css'
import { tournaments, defaultTournamentId } from './data'

function App() {
  const t = tournaments[defaultTournamentId]
  const matchCount =
    t.groupMatches.length + t.knockoutRounds.reduce((n, r) => n + r.matches.length, 0)

  return (
    <main className="landing">
      <h1>⚽ No Spoiler Soccer</h1>
      <p>Catch up on the World Cup at your own pace — highlights, no spoilers.</p>
      <p className="status">
        {t.name} loaded: {Object.keys(t.teams).length} teams · {t.groups.length} groups ·{' '}
        {matchCount} matches. The bracket is coming.
      </p>
    </main>
  )
}

export default App

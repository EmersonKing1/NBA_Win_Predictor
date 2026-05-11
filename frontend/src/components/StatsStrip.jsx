export function StatsStrip({ game, probability }) {
  const home = game.homeTeam
  const away = game.awayTeam
  const homeScore = game.homeTeam.score ?? 0
  const awayScore = game.awayTeam.score ?? 0
  const diff = homeScore - awayScore
  const leader = diff >= 0 ? home.abbreviation : away.abbreviation
  const leaderColor = diff >= 0 ? (home.color ?? 'var(--accent)') : (away.color ?? 'var(--accent)')
  const lead = Math.abs(diff)

  const period = game.period ?? 0
  const clockStr = game.clock ?? '12:00'
  const [mStr, sStr] = clockStr.split(':')
  const clockSecs = (parseInt(mStr, 10) || 0) * 60 + (parseInt(sStr, 10) || 0)
  const quartersDone = Math.max(0, (period <= 4 ? period - 1 : 4))
  const totalSecsLeft = quartersDone < 4
    ? (4 - period) * 720 + clockSecs
    : clockSecs
  const minsLeft = Math.floor(totalSecsLeft / 60)
  const secsLeft = totalSecsLeft % 60

  const homeProb = probability?.homeWinProbability
  const awayProb = probability?.awayWinProbability
  const pctHome = homeProb != null ? Math.round(homeProb * 100) : null
  const pctAway = awayProb != null ? Math.round(awayProb * 100) : null

  const isFinal = game.status === 'post'
  const isPre   = game.status === 'pre'

  return (
    <div className="stats-strip">
      <div className="stat-cell">
        <div className="stat-k">Current Lead</div>
        <div className="stat-v" style={{ color: leaderColor }}>
          {isPre ? '—' : diff === 0 ? 'TIED' : `${leader} +${lead}`}
        </div>
        <div className="stat-sub">{diff === 0 && !isPre ? 'tied game' : isPre ? 'pregame' : 'leading'}</div>
      </div>

      <div className="stat-cell">
        <div className="stat-k">Time Remaining</div>
        <div className="stat-v">
          {isFinal ? 'FINAL' : isPre ? '—' : `${minsLeft}:${String(secsLeft).padStart(2, '0')}`}
        </div>
        <div className="stat-sub">
          {isFinal ? 'game over' : isPre ? 'tip-off' : `Q${Math.min(period, 4)} clock`}
        </div>
      </div>

      <div className="stat-cell">
        <div className="stat-k">Home Win %</div>
        <div className="stat-v" style={{ color: home.color ?? 'var(--text)' }}>
          {pctHome != null ? `${pctHome}%` : '—'}
        </div>
        <div className="stat-sub">{home.abbreviation}</div>
      </div>

      <div className="stat-cell">
        <div className="stat-k">Away Win %</div>
        <div className="stat-v" style={{ color: away.color ?? 'var(--text)' }}>
          {pctAway != null ? `${pctAway}%` : '—'}
        </div>
        <div className="stat-sub">{away.abbreviation}</div>
      </div>

      <div className="stat-cell">
        <div className="stat-k">Score</div>
        <div className="stat-v" style={{ fontSize: 22 }}>
          {isPre
            ? 'PRE'
            : `${homeScore}–${awayScore}`
          }
        </div>
        <div className="stat-sub">{home.abbreviation} vs {away.abbreviation}</div>
      </div>
    </div>
  )
}

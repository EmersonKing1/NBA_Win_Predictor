function formatDate(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
}

export function RecentGameCard({ game }) {
  const homeWon = game.homeTeam.isWinner
  const awayWon = game.awayTeam.isWinner

  // homePct = percentage the home team had going in (from our formula)
  const homePct = Math.round((game.homeWinProbability ?? (homeWon ? 1 : 0)) * 100)
  const awayPct = Math.round((game.awayWinProbability ?? (awayWon ? 1 : 0)) * 100)

  const winnerPct = homeWon ? homePct : awayPct
  const isUpset   = winnerPct < 35

  function TeamRow({ team, won }) {
    return (
      <div className={`recent-team-row${won ? ' win' : ''}`}>
        <span className="recent-team-name">
          {team.logo
            ? <img className="recent-mark-logo" src={team.logo} alt={team.abbreviation} />
            : <span className="recent-mark">{team.abbreviation.slice(0, 2)}</span>
          }
          {team.abbreviation}
        </span>
        <span className="score">{team.score}</span>
      </div>
    )
  }

  return (
    <div className="recent-card">
      <div className="recent-card-top">
        <span className="recent-card-status">
          {isUpset && <span className="upset-badge" style={{ marginRight: 5 }}>Upset</span>}
          Final
        </span>
        <span className="recent-card-date">{formatDate(game.gameDate)}</span>
      </div>

      <TeamRow team={game.homeTeam} won={homeWon} />
      <TeamRow team={game.awayTeam} won={awayWon} />

      {/* mini hatched prob bar — homePct on left */}
      <div className="recent-pbar" style={{ '--left': homePct }} />
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
}

export function RecentGameCard({ game, onPick, isActive }) {
  const homeWon = game.homeTeam.isWinner
  const awayWon = game.awayTeam.isWinner

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
    <div
      className={`recent-card${isActive ? ' recent-card-active' : ''}${onPick ? ' recent-card-clickable' : ''}`}
      onClick={onPick ? () => onPick(game.id) : undefined}
    >
      <div className="recent-card-top">
        <span className="recent-card-status">
          {isUpset && <span className="upset-badge">Upset</span>}
          Final
          {game.seriesNote && (
            <span className="series-note">{game.seriesNote}</span>
          )}
        </span>
        <span className="recent-card-date">{formatDate(game.gameDate)}</span>
      </div>

      <div className="recent-card-body">
        <TeamRow team={game.homeTeam} won={homeWon} />
        <TeamRow team={game.awayTeam} won={awayWon} />
        <div className="recent-pbar" style={{ '--left': homePct }} />
      </div>

      {isActive && (
        <div className="recent-card-featured">FEATURED</div>
      )}
    </div>
  )
}

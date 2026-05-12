function formatDate(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
}

export function RecentGameCard({ game, onPick, isActive }) {
  const homeWon = game.homeTeam.isWinner
  const awayWon = game.awayTeam.isWinner

  const winnerColor = homeWon
    ? (game.homeTeam.color ?? '#888')
    : (game.awayTeam.color ?? '#888')

  const isUpset = false // kept for future use

  function TeamRow({ team, won }) {
    return (
      <div className={`recent-team-row${won ? ' win' : ''}`}>
        <span className="recent-team-name">
          {team.logo
            ? <img className="recent-mark-logo" src={team.logo} alt={team.abbreviation} onError={e => { e.target.style.display = 'none' }} />
            : <span className="recent-mark">{team.abbreviation.slice(0, 2)}</span>
          }
          {team.abbreviation}
        </span>
        <span className={`score${won ? ' score-win' : ''}`}>{team.score}</span>
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
      </div>

      {/* Winner accent — solid stripe, always visible, always correct color */}
      <div className="recent-winner-stripe" style={{ background: winnerColor }} />

      {isActive && (
        <div className="recent-card-featured">FEATURED</div>
      )}
    </div>
  )
}

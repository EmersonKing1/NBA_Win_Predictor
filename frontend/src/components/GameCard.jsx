import { ProbabilityBar } from './ProbabilityBar.jsx'

function TeamMark({ logo, abbr, dim }) {
  if (logo) {
    return (
      <div className={`team-mark-logo${dim ? ' dim' : ''}`}>
        <img src={logo} alt={abbr} onError={e => { e.target.style.display = 'none' }} />
      </div>
    )
  }
  return <div className="team-mark">{abbr.slice(0, 2)}</div>
}

export function GameCard({ game, probability }) {
  const isLive  = game.status === 'in'
  const isFinal = game.status === 'post'
  const isPre   = game.status === 'pre'

  const homeProb = probability?.homeWinProbability ?? 0.6
  const awayProb = probability?.awayWinProbability ?? 0.4

  const homeScore = game.homeTeam.score
  const awayScore = game.awayTeam.score

  // Determine result classes for scores
  const homeWins = isFinal ? game.homeTeam.isWinner : homeScore > awayScore
  const awayWins = isFinal ? game.awayTeam.isWinner : awayScore > homeScore

  // Corner badge content
  let badgeClass = 'corner-badge'
  let badgeText  = game.statusText
  if (isLive)  badgeClass += ' live'

  // Tilt alternates
  const tilt = Math.abs(game.id.charCodeAt(game.id.length - 1) % 2) === 0 ? 'tilt-l' : 'tilt-r'

  return (
    <article className={`sk-card game-card ${tilt}`}>
      <span className={badgeClass}>{badgeText}</span>

      {/* Teams + Scores */}
      <div className="teams-row">
        {/* Home */}
        <div className="team-block">
          <TeamMark logo={game.homeTeam.logo} abbr={game.homeTeam.abbreviation} dim={isFinal && !game.homeTeam.isWinner} />
          <div className="team-info">
            <div className="team-name">{game.homeTeam.abbreviation}</div>
            <div className="team-city">{game.homeTeam.name}</div>
            <div className="team-record">Home</div>
          </div>
        </div>

        {/* Score */}
        <div className="score-area">
          {isPre ? (
            <div className="score-pregame">PREGAME</div>
          ) : (
            <div className="score-display">
              <span className={`score-val${homeWins ? ' winner' : awayWins ? ' loser' : ''}`}>
                {homeScore}
              </span>
              <span className="score-dash">—</span>
              <span className={`score-val${awayWins ? ' winner' : homeWins ? ' loser' : ''}`}>
                {awayScore}
              </span>
            </div>
          )}
        </div>

        {/* Away */}
        <div className="team-block right">
          <TeamMark logo={game.awayTeam.logo} abbr={game.awayTeam.abbreviation} dim={isFinal && !game.awayTeam.isWinner} />
          <div className="team-info">
            <div className="team-name">{game.awayTeam.abbreviation}</div>
            <div className="team-city">{game.awayTeam.name}</div>
            <div className="team-record">Away</div>
          </div>
        </div>
      </div>

      {/* Probability bar */}
      <ProbabilityBar
        homeProb={homeProb}
        awayProb={awayProb}
        homeAbbr={game.homeTeam.abbreviation}
        awayAbbr={game.awayTeam.abbreviation}
        status={game.status}
        homeLinescores={game.homeTeam.linescores}
        awayLinescores={game.awayTeam.linescores}
      />

      {/* Meta row */}
      <div className="card-meta">
        <span>
          {isFinal && 'Final score'}
          {isLive  && `Lead +${Math.abs(homeScore - awayScore)} ${homeScore >= awayScore ? game.homeTeam.abbreviation : game.awayTeam.abbreviation}`}
          {isPre   && 'Pre-game · home court edge applied'}
        </span>
        <span className="game-id">{game.id}</span>
      </div>
    </article>
  )
}

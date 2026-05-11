import { useRef } from 'react'

function TeamLogo({ logo, abbr, color }) {
  if (logo) {
    return (
      <div className="gc-logo">
        <img src={logo} alt={abbr} onError={e => { e.target.style.display = 'none' }} />
      </div>
    )
  }
  return (
    <div className="gc-logo-text" style={{ background: color ?? 'var(--panel-3)' }}>
      {abbr.slice(0, 2)}
    </div>
  )
}

function statusLabel(game) {
  if (game.status === 'post') return 'FINAL'
  if (game.status === 'pre') return 'PRE'
  const p = game.period
  const q = p > 4 ? `OT${p - 4 > 1 ? p - 4 : ''}` : `Q${p}`
  return `${q} · ${game.clock}`
}

export function GameSwitcher({ games, probs, activeId, onPick }) {
  const ref = useRef(null)
  const scroll = (dx) => {
    if (ref.current) ref.current.scrollBy({ left: dx, behavior: 'smooth' })
  }

  const sorted = [...games].sort((a, b) => {
    const order = { in: 0, pre: 1, post: 2 }
    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
  })

  return (
    <div>
      <div className="switcher-head">
        <div className="switcher-title">
          All Games
          <span className="switcher-count">{games.length}</span>
        </div>
        <div className="switcher-nav">
          <button className="nav-btn" onClick={() => scroll(-320)}>‹</button>
          <button className="nav-btn" onClick={() => scroll(320)}>›</button>
        </div>
      </div>

      <div className="switcher" ref={ref}>
        {sorted.map(game => {
          const home = game.homeTeam
          const away = game.awayTeam
          const prob = probs[game.id]
          const homeProb = prob?.homeWinProbability ?? 0.5
          const pctHome = Math.round(homeProb * 100)
          const pctAway = 100 - pctHome
          const homeLeads = game.homeTeam.score >= game.awayTeam.score
          const isFinal = game.status === 'post'
          const homeFinal = isFinal && home.isWinner
          const awayFinal = isFinal && away.isWinner

          return (
            <button
              key={game.id}
              className={`game-card${game.id === activeId ? ' active' : ''}`}
              onClick={() => onPick(game.id)}
            >
              <div className="gc-head">
                <span className="gc-status">{statusLabel(game)}</span>
                <span>{game.id === activeId ? 'FEATURED' : 'CLICK TO FEATURE'}</span>
              </div>

              <div className={`gc-row${isFinal && !homeFinal ? ' dim' : ''}`}>
                <TeamLogo logo={home.logo} abbr={home.abbreviation} color={home.color} />
                <span className="gc-team">{home.abbreviation}</span>
                <span className="gc-score">{game.status === 'pre' ? '—' : home.score}</span>
              </div>

              <div className={`gc-row${isFinal && !awayFinal ? ' dim' : ''}`}>
                <TeamLogo logo={away.logo} abbr={away.abbreviation} color={away.color} />
                <span className="gc-team">{away.abbreviation}</span>
                <span className="gc-score">{game.status === 'pre' ? '—' : away.score}</span>
              </div>

              <div className="gc-bar">
                <div className="gc-bar-fill" style={{ width: pctHome + '%', background: home.color ?? 'var(--accent)' }} />
                <div className="gc-bar-fill" style={{ width: pctAway + '%', background: away.color ?? 'var(--muted)' }} />
              </div>

              <div className="gc-probs">
                <span style={{ color: home.color ?? 'var(--accent)', fontWeight: 700 }}>{pctHome}%</span>
                <span style={{ color: away.color ?? 'var(--muted)', fontWeight: 700 }}>{pctAway}%</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

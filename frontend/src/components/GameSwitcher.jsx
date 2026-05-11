import { useRef } from 'react'
import { distinctAwayColor } from '../utils.js'

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
  if (game.status === 'pre') {
    // Show time from statusText (e.g. "7:30 PM ET"), strip trailing "ET" duplication if needed
    const t = game.statusText ?? ''
    return t || 'TBD'
  }
  const p = game.period
  const q = p > 4 ? `OT${p - 4 > 1 ? p - 4 : ''}` : `Q${p}`
  return `${q} · ${game.clock}`
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}`
}

export function GameSwitcher({ games, probs, activeId, onPick }) {
  const ref = useRef(null)
  const scroll = (dx) => {
    if (ref.current) ref.current.scrollBy({ left: dx, behavior: 'smooth' })
  }

  const hasLive = games.some(g => g.status === 'in')

  const sorted = [...games].sort((a, b) => {
    const order = { in: 0, pre: 1, post: 2 }
    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
  })

  return (
    <div>
      <div className="switcher-head">
        <div className="switcher-title">
          {hasLive && <span className="switcher-live-pill"><span className="live-dot" />LIVE</span>}
          Upcoming Games
          <span className="switcher-count">{games.length}</span>
        </div>
        <div className="switcher-nav">
          <button className="nav-btn" onClick={() => scroll(-280)}>‹</button>
          <button className="nav-btn" onClick={() => scroll(280)}>›</button>
        </div>
      </div>

      <div className="switcher-wrap">
      <div className="switcher" ref={ref}>
        {sorted.map(game => {
          const home = game.homeTeam
          const away = game.awayTeam
          const prob  = probs[game.id]
          const homeProb = prob?.homeWinProbability ?? 0.5
          const awayProb = prob?.awayWinProbability ?? (1 - homeProb)
          const pctHome = (homeProb * 100).toFixed(1)
          const pctAway = (awayProb * 100).toFixed(1)
          const isFinal  = game.status === 'post'
          const isLive   = game.status === 'in'
          const homeFinal = isFinal && home.isWinner
          const awayFinal = isFinal && away.isWinner
          const homeColor = home.color ?? '#cc0000'
          const awayColor = distinctAwayColor(homeColor, away.color ?? '#888888')

          return (
            <button
              key={game.id}
              className={`game-card${game.id === activeId ? ' active' : ''}`}
              onClick={() => onPick(game.id)}
            >
              {/* Status row */}
              <div className="gc-head">
                <span className="gc-status">
                  {isLive && <span className="gc-live-dot" />}
                  {statusLabel(game)}
                </span>
                <span>{game.id === activeId ? 'FEATURED' : ''}</span>
              </div>
              {game.seriesNote && (
                <div className="gc-series-note">{game.seriesNote}</div>
              )}

              {/* Score rows */}
              <div className="gc-body">
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
              </div>

              {/* Probability bar */}
              <div className="gc-prob-section">
                <div className="gc-bar">
                  <div className="gc-bar-fill" style={{ width: pctHome + '%', background: homeColor }} />
                  <div className="gc-bar-fill" style={{ width: pctAway + '%', background: awayColor }} />
                </div>
                <div className="gc-probs">
                  <span style={{ color: homeColor }}>{pctHome}%</span>
                  <span style={{ color: awayColor }}>{pctAway}%</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
      </div>
    </div>
  )
}

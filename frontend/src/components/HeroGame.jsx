import { useState, useEffect, useRef } from 'react'

function TeamLogo({ logo, abbr, color, dim }) {
  if (logo) {
    return (
      <div className={`team-logo-wrap${dim ? ' dim' : ''}`}>
        <img src={logo} alt={abbr} onError={e => { e.target.style.display = 'none' }} />
      </div>
    )
  }
  return (
    <div className="team-abbr-mark" style={{ background: color ?? 'var(--panel-3)' }}>
      {abbr.slice(0, 2)}
    </div>
  )
}

function fmtClock(clockStr) {
  if (!clockStr || clockStr === '0:00') return '0:00'
  return clockStr
}

function qLabel(period) {
  if (!period) return ''
  if (period > 4) return `OT${period - 4 > 1 ? period - 4 : ''}`
  return `Q${period}`
}

export function HeroGame({ game, probability }) {
  const isLive  = game.status === 'in'
  const isFinal = game.status === 'post'
  const isPre   = game.status === 'pre'

  const homeProb = probability?.homeWinProbability ?? (isPre ? 0.6 : 0.5)
  const awayProb = 1 - homeProb
  const pctHome = Math.round(homeProb * 100)
  const pctAway = 100 - pctHome

  const flexHome = Math.max(6, Math.min(94, pctHome))
  const flexAway = 100 - flexHome

  const homeScore = game.homeTeam.score
  const awayScore = game.awayTeam.score
  const homeFinal = isFinal && game.homeTeam.isWinner
  const awayFinal = isFinal && game.awayTeam.isWinner

  const [bumpHome, setBumpHome] = useState(false)
  const [bumpAway, setBumpAway] = useState(false)
  const prevH = useRef(homeScore)
  const prevA = useRef(awayScore)
  useEffect(() => {
    if (homeScore !== prevH.current) {
      setBumpHome(true)
      setTimeout(() => setBumpHome(false), 600)
      prevH.current = homeScore
    }
    if (awayScore !== prevA.current) {
      setBumpAway(true)
      setTimeout(() => setBumpAway(false), 600)
      prevA.current = awayScore
    }
  }, [homeScore, awayScore])

  const home = game.homeTeam
  const away = game.awayTeam
  const diff = homeScore - awayScore
  const leader = diff >= 0 ? home.abbreviation : away.abbreviation
  const lead = Math.abs(diff)

  const homeColor = home.color ?? 'var(--panel-3)'
  const awayColor = away.color ?? 'var(--panel-3)'

  return (
    <section
      className="hero"
      style={{
        '--home-glow': homeColor,
        '--away-glow': awayColor,
      }}
    >
      <div className="hero-head">
        <div className="left">
          <span className="ticker">
            <span className="dot" />
            FEATURED MATCHUP
          </span>
          <span>{game.venue ?? ''}</span>
        </div>
        <div className="right">
          {isLive && diff !== 0 && <span>{leader} +{lead}</span>}
          {isFinal && <span>FINAL</span>}
          {isPre && <span>PREGAME</span>}
        </div>
      </div>

      <div className="matchup">
        {/* Home */}
        <div className="team-side home">
          <TeamLogo logo={home.logo} abbr={home.abbreviation} color={homeColor} dim={isFinal && !homeFinal} />
          <div className="team-meta">
            <div className="team-city">{home.name?.split(' ').slice(0, -1).join(' ').toUpperCase()}</div>
            <div className="team-name">{home.name?.split(' ').slice(-1)[0]?.toUpperCase() ?? home.abbreviation}</div>
            <div className="team-record">HOME</div>
          </div>
          <div className={`hero-score${bumpHome ? ' bump' : ''}`} style={isFinal && !homeFinal ? { opacity: 0.35 } : {}}>
            {isPre ? '—' : homeScore}
          </div>
        </div>

        {/* Clock */}
        <div className="clock-block">
          {isPre ? (
            <>
              <div className="clock-quarter" style={{ fontSize: 18, color: 'var(--muted)' }}>TIP</div>
              <div className="clock-time" style={{ fontSize: 16 }}>{game.statusText}</div>
              <div className="clock-tag">Pregame</div>
            </>
          ) : (
            <>
              <div className="clock-quarter">{qLabel(game.period)}</div>
              <div className="clock-time">{fmtClock(game.clock)}</div>
              <div className="clock-tag">{isFinal ? 'Final' : 'In Play'}</div>
            </>
          )}
        </div>

        {/* Away */}
        <div className="team-side away">
          <TeamLogo logo={away.logo} abbr={away.abbreviation} color={awayColor} dim={isFinal && !awayFinal} />
          <div className="team-meta">
            <div className="team-city">{away.name?.split(' ').slice(0, -1).join(' ').toUpperCase()}</div>
            <div className="team-name">{away.name?.split(' ').slice(-1)[0]?.toUpperCase() ?? away.abbreviation}</div>
            <div className="team-record">AWAY</div>
          </div>
          <div className={`hero-score${bumpAway ? ' bump' : ''}`} style={isFinal && !awayFinal ? { opacity: 0.35 } : {}}>
            {isPre ? '—' : awayScore}
          </div>
        </div>
      </div>

      {/* WP bar */}
      <div className="prob-section">
        <div className="wp-label-row">
          <span>{home.abbreviation} WIN PROBABILITY</span>
          <span className="center">
            <span className="live-dot" style={{ background: 'var(--accent)' }} />
            {isLive ? 'UPDATING IN REAL-TIME' : isFinal ? 'FINAL RESULT' : 'PRE-GAME ESTIMATE'}
          </span>
          <span>{away.abbreviation} WIN PROBABILITY</span>
        </div>

        {isPre ? (
          /* Simple bar for pregame */
          <div style={{ position: 'relative', height: 56, borderRadius: 10, overflow: 'hidden', display: 'flex', background: 'var(--panel-3)', border: '1px solid var(--border)' }}>
            <div className="wp-side home" style={{ flexBasis: flexHome + '%', background: homeColor }}>
              <span className="wp-pct">{pctHome}%</span>
              <span className="wp-abbr">{home.abbreviation}</span>
            </div>
            <div className="wp-divider" />
            <div className="wp-side away" style={{ flexBasis: flexAway + '%', background: awayColor }}>
              <span className="wp-abbr">{away.abbreviation}</span>
              <span className="wp-pct">{pctAway}%</span>
            </div>
          </div>
        ) : (
          <div className="pbar">
            <div className="wp-side home" style={{ flexBasis: flexHome + '%', background: homeColor }}>
              <span className="wp-pct">{pctHome}%</span>
              <span className="wp-abbr">{home.abbreviation}</span>
            </div>
            <div className="wp-divider" />
            <div className="wp-side away" style={{ flexBasis: flexAway + '%', background: awayColor }}>
              <span className="wp-abbr">{away.abbreviation}</span>
              <span className="wp-pct">{pctAway}%</span>
            </div>
          </div>
        )}

        {isPre && (
          <div className="prob-pregame-note">PRE-TIP ESTIMATE · HOME COURT ADVANTAGE APPLIED</div>
        )}
      </div>
    </section>
  )
}

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

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}`
}

function qLabel(period) {
  if (!period) return ''
  if (period > 4) return `OT${period - 4 > 1 ? period - 4 : ''}`
  return `Q${period}`
}

function breakLabel(period, clock) {
  if (!clock) return null
  // Match "0:00", "0.0", "00:00" etc.
  if (!/^0+[:.]0+$/.test(clock.trim())) return null
  if (period === 1) return 'END Q1'
  if (period === 2) return 'HALFTIME'
  if (period === 3) return 'END Q3'
  if (period === 4) return 'END Q4'
  if (period >= 5) return period === 5 ? 'END OT' : `END OT${period - 4}`
  return null
}

export function HeroGame({ game, probability, teamRecords = {}, homeColor: homeColorProp, awayColor: awayColorProp }) {
  const isLive  = game.status === 'in'
  const isFinal = game.status === 'post'
  const isPre   = game.status === 'pre'

  const homeProb = probability?.homeWinProbability ?? (isPre ? 0.6 : 0.5)
  const awayProb = probability?.awayWinProbability ?? (1 - homeProb)
  const pctHome = (homeProb * 100).toFixed(1)
  const pctAway = (awayProb * 100).toFixed(1)

  // For finished games snap divider to edge; cap live/pre at 4–96 to keep both sides visible
  const flexHome = isFinal
    ? (game.homeTeam.isWinner ? 100 : 0)
    : Math.max(4, Math.min(96, Math.round(homeProb * 100)))
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

  const homeColor = homeColorProp ?? home.color ?? '#cc0000'
  const awayColor = awayColorProp ?? away.color ?? '#f5a623'

  return (
    <section
      className="hero"
      style={{
        '--home-glow': homeColor,
        '--away-glow': awayColor,
      }}
    >
      {/* Top banner */}
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
          {game.seriesNote && <span className="hero-series-note">{game.seriesNote}</span>}
          {game.gameDate && <span>{fmtDate(game.gameDate)}</span>}
        </div>
      </div>

      {/* Matchup: vertical columns */}
      <div className="matchup">

        {/* Home — left column */}
        <div className="team-side home">
          <TeamLogo logo={home.logo} abbr={home.abbreviation} color={homeColor} dim={isFinal && !homeFinal} />
          <div className="team-meta">
            <div className="team-city">{home.name?.split(' ').slice(0, -1).join(' ') ?? ''}</div>
            <div className="team-name">{home.name?.split(' ').slice(-1)[0] ?? home.abbreviation}</div>
            <div className="team-record">{teamRecords[home.id] ?? 'HOME'}</div>
          </div>
          <div
            className={`hero-score${bumpHome ? ' bump' : ''}`}
            style={isFinal && !homeFinal ? { opacity: 0.28 } : {}}
          >
            {isPre ? '—' : homeScore}
          </div>
        </div>

        {/* Center clock */}
        <div className="clock-block">
          {isFinal ? (
            <div className="clock-final">FINAL</div>
          ) : isPre ? (
            <>
              <div className="clock-quarter">TIP</div>
              <div className="clock-time" style={{ fontSize: 18 }}>{game.statusText}</div>
              <div className="clock-tag">Pregame</div>
            </>
          ) : (() => {
            const label = breakLabel(game.period, game.clock)
            return label ? (
              <>
                <div className="clock-time clock-break">{label}</div>
                <span className="live-dot clock-live-dot" />
              </>
            ) : (
              <>
                <div className="clock-quarter">{qLabel(game.period)}</div>
                <div className="clock-time">{game.clock}</div>
                <div className="clock-tag">In Play</div>
                <span className="live-dot clock-live-dot" />
              </>
            )
          })()}
        </div>

        {/* Away — right column */}
        <div className="team-side away">
          <TeamLogo logo={away.logo} abbr={away.abbreviation} color={awayColor} dim={isFinal && !awayFinal} />
          <div className="team-meta">
            <div className="team-city">{away.name?.split(' ').slice(0, -1).join(' ') ?? ''}</div>
            <div className="team-name">{away.name?.split(' ').slice(-1)[0] ?? away.abbreviation}</div>
            <div className="team-record">{teamRecords[away.id] ?? 'AWAY'}</div>
          </div>
          <div
            className={`hero-score${bumpAway ? ' bump' : ''}`}
            style={isFinal && !awayFinal ? { opacity: 0.28 } : {}}
          >
            {isPre ? '—' : awayScore}
          </div>
        </div>
      </div>

      {/* Win probability bar */}
      <div className="prob-section">
        <div className="wp-label-row">
          <span className="wp-team-label" style={{ color: homeColor }}>
            <span className="wp-pct-val">{pctHome}%</span>
            <span className="wp-team-abbr">{home.abbreviation}</span>
          </span>
          <span className="center">
            {isFinal ? 'FINAL' : isPre ? 'PRE-GAME' : null}
          </span>
          <span className="wp-team-label right" style={{ color: awayColor }}>
            <span className="wp-team-abbr">{away.abbreviation}</span>
            <span className="wp-pct-val">{pctAway}%</span>
          </span>
        </div>

        <div className="pbar">
          {flexHome > 0 && <div className="wp-side home" style={{ flexBasis: flexHome + '%', background: homeColor }} />}
          {flexHome > 0 && flexAway > 0 && <div className="wp-divider" />}
          {flexAway > 0 && <div className="wp-side away" style={{ flexBasis: flexAway + '%', background: awayColor }} />}
        </div>

      </div>
    </section>
  )
}

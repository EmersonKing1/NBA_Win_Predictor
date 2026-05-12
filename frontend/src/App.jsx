import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_BACKEND_URL ?? ''

import { RecentGameCard } from './components/RecentGameCard.jsx'
import { HeroGame }       from './components/HeroGame.jsx'
import { WPChart }        from './components/WPChart.jsx'
import { GameSwitcher }   from './components/GameSwitcher.jsx'
import { TEAM_COLORS }    from './teamColors.js'
import { distinctAwayColor } from './utils.js'

// Convert period + remaining clock ("M:SS") to elapsed minutes
function gameElapsed(period, clock) {
  if (!period || period < 1) return 0
  let remSec = 0
  if (clock) {
    const [m, s] = clock.split(':').map(Number)
    remSec = (isNaN(m) ? 0 : m * 60) + (isNaN(s) ? 0 : s)
  }
  const qLen    = period <= 4 ? 720 : 300  // seconds per quarter / OT
  const baseMin = period <= 4 ? (period - 1) * 12 : 48 + (period - 5) * 5
  return baseMin + (qLen - remSec) / 60
}

function enrichGame(game) {
  const enrichTeam = t => ({
    ...t,
    // Our curated map takes priority — ESPN's color field often returns an alternate
    // (e.g. Knicks shows as blue, Pistons as blue) rather than the recognizable logo color.
    color: TEAM_COLORS[t.abbreviation] ?? TEAM_COLORS[t.id] ?? t.color ?? null,
  })
  return {
    ...game,
    homeTeam: enrichTeam(game.homeTeam),
    awayTeam: enrichTeam(game.awayTeam),
  }
}


const POLL_INTERVAL        = 7000
const RECENT_POLL_INTERVAL = 60000

export default function App() {
  const [games, setGames]          = useState([])
  const [probs, setProbs]          = useState({})
  const [recentGames, setRecent]   = useState([])
  const [error, setError]          = useState(null)
  const [loading, setLoading]      = useState(true)
  const [clockStr, setClock]       = useState('—')
  const [activeId, setActiveId]    = useState(null)

  // WP chart data — own model only, seeded from server on load
  const [wpHistory, setWpHistory]   = useState({})
  const [teamRecords, setTeamRecords] = useState({})

  // Live clock
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      let h = d.getHours()
      const m = d.getMinutes()
      const ap = h >= 12 ? 'PM' : 'AM'
      h = h % 12 || 12
      setClock(`${h}:${String(m).padStart(2, '0')} ${ap}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Poll live games + probabilities
  useEffect(() => {
    const fetchLive = async () => {
      try {
        const data = await fetch(`${API}/games`).then(r => r.json())
        const gs = (data.games ?? []).map(enrichGame)
        setGames(gs)
        setError(null)

        if (gs.length > 0) {
          // Fetch model probabilities for all games
          const results = await Promise.allSettled(
            gs.map(g => fetch(`${API}/probability/${g.id}`).then(r => r.json()))
          )
          const map = {}
          results.forEach((r, i) => {
            if (r.status === 'fulfilled') map[gs[i].id] = r.value
          })
          setProbs(prev => ({ ...prev, ...map }))

          // Accumulate WP history using our model (same source as the bar)
          setWpHistory(prev => {
            const next = { ...prev }
            for (const g of gs) {
              const wp = map[g.id]?.homeWinProbability ?? 0.5
              if (g.status === 'pre') {
                // Overwrite each poll — keeps the pregame dot accurate, stays 1 point
                next[g.id] = [{ homeWP: wp, elapsed: 0 }]
              } else if (g.status === 'in') {
                const elapsed = gameElapsed(g.period, g.clock)
                const arr = (next[g.id] ?? []).slice(-400)
                arr.push({ homeWP: wp, elapsed })
                next[g.id] = arr
              }
              // post: leave existing snapshot in place
            }
            return next
          })

          setActiveId(prev => {
            if (prev) return prev
            const live = gs.find(g => g.status === 'in')
            return live ? live.id : gs[0]?.id ?? null
          })
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    const fetchRecent = async () => {
      try {
        const data = await fetch(`${API}/recent-games`).then(r => r.json())
        const gs = (data.games ?? []).map(enrichGame)
        setRecent(gs)
        const recentProbs = {}
        for (const g of gs) {
          recentProbs[g.id] = {
            homeWinProbability: g.homeTeam.isWinner ? 1 : 0,
            awayWinProbability: g.awayTeam.isWinner ? 1 : 0,
          }
        }
        setProbs(prev => ({ ...prev, ...recentProbs }))
      } catch (_) {}
    }

    fetchLive()
    fetchRecent()
    const liveId   = setInterval(fetchLive,   POLL_INTERVAL)
    const recentId = setInterval(fetchRecent, RECENT_POLL_INTERVAL)
    return () => { clearInterval(liveId); clearInterval(recentId) }
  }, [])

  // On load (or when switching games), seed wpHistory from the server's
  // accumulated model snapshots so reloading doesn't lose the chart history.
  useEffect(() => {
    if (!activeId) return
    fetch(`${API}/wp-history/${activeId}`)
      .then(r => r.json())
      .then(data => {
        const hist = data.history ?? []
        if (hist.length === 0) return
        setWpHistory(prev => {
          // Only seed if we don't already have more data locally
          const existing = prev[activeId] ?? []
          if (existing.length >= hist.length) return prev
          return { ...prev, [activeId]: hist }
        })
      })
      .catch(() => {})
  }, [activeId])

  const allGames   = [...games, ...recentGames.filter(r => !games.find(g => g.id === r.id))]
  const liveCount  = games.filter(g => g.status === 'in').length
  const activeGame = allGames.find(g => g.id === activeId) ?? allGames[0] ?? null
  const activeProb = activeGame ? probs[activeGame.id] : null

  // Canonical team colors — shared by HeroGame bar, WPChart, and chart legend
  const activeHomeColor = activeGame?.homeTeam.color ?? '#cc0000'
  const activeAwayColor = activeGame
    ? distinctAwayColor(activeHomeColor, activeGame.awayTeam.color ?? '#f5a623')
    : '#f5a623'

  // Chart uses only our model's snapshots — seeded from server on load,
  // then extended by live polls each 7 s.
  const chartHistory = wpHistory[activeGame?.id] ?? []

  const handlePick = (id) => setActiveId(id)

  return (
    <div className="app">

      {/* ── Masthead ── */}
      <header className="masthead">
        <div className="brandmark">
          <div className="brand-mark">T</div>
          <div className="site-title">Tipoff <span className="site-title-accent">Live</span></div>
        </div>

        <div className="masthead-center" />

        <div className="masthead-meta">
          {liveCount > 0 && <span className="pulse-pill">LIVE</span>}
          <span>{liveCount > 0 ? `${liveCount} GAME${liveCount > 1 ? 'S' : ''}` : 'NO LIVE GAMES'}</span>
          <span className="masthead-clock">{clockStr} EST</span>
        </div>
      </header>

      {/* ── Page content ── */}
      <div className="page-content">
        {error ? (
          <div className="error-state">
            <div>BACKEND OFFLINE</div>
            <div className="sub">
              Start the server: <code>cd backend_py &amp;&amp; python server.py</code>
            </div>
          </div>
        ) : loading ? (
          <div>
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" style={{ height: 80, marginTop: 8 }} />
          </div>
        ) : allGames.length === 0 ? (
          <div className="empty-state">
            <h2>NO GAMES TODAY</h2>
            <p>Check back during the NBA season for live win probabilities.</p>
          </div>
        ) : (
          <>
            {/* Hero matchup */}
            {activeGame && (
              <HeroGame
                game={activeGame}
                probability={activeProb}
                teamRecords={teamRecords}
                homeColor={activeHomeColor}
                awayColor={activeAwayColor}
              />
            )}

            {/* WP Chart — full width */}
            {activeGame && chartHistory.length >= 1 && (
              <div className="panel-card">
                <div className="panel-card-head">
                  <div className="panel-card-title">
                    Win Probability ·{' '}
                    {activeGame.status === 'in' ? 'Live'
                      : activeGame.status === 'post' ? 'Final'
                      : 'Pre-Game'}
                  </div>
                  <div className="panel-card-sub">
                    {activeGame.homeTeam.abbreviation} vs {activeGame.awayTeam.abbreviation}
                    {activeGame.status === 'post' && ' · Full Game'}
                  </div>
                </div>
                <WPChart
                  history={chartHistory}
                  homeColor={activeHomeColor}
                  awayColor={activeAwayColor}
                  homeAbbr={activeGame.homeTeam.abbreviation}
                  awayAbbr={activeGame.awayTeam.abbreviation}
                />
                <div className="chart-legend">
                  <span>
                    <span className="chart-swatch" style={{ background: activeHomeColor }} />
                    {activeGame.homeTeam.abbreviation} (Home)
                  </span>
                  <span>
                    <span className="chart-swatch" style={{ background: activeAwayColor }} />
                    {activeGame.awayTeam.abbreviation} (Away)
                  </span>
                  {activeGame.status === 'pre' && (
                    <span style={{ marginLeft: 'auto' }}>AWAITING TIPOFF</span>
                  )}
                </div>
              </div>
            )}

            {/* Game switcher */}
            <GameSwitcher
              games={games}
              probs={probs}
              activeId={activeId}
              onPick={handlePick}
            />

            {/* Recent results */}
            {recentGames.length > 0 && (
              <div className="recent-section">
                <div className="section-header">
                  <span className="section-label">Recent Results</span>
                </div>
                <div className="recent-grid">
                  {recentGames.map(game => (
                    <RecentGameCard
                      key={game.id}
                      game={game}
                      onPick={handlePick}
                      isActive={game.id === activeId}
                    />
                  ))}
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  )
}

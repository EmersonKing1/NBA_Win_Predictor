import { useState, useEffect, useRef } from 'react'

const API = import.meta.env.VITE_BACKEND_URL ?? ''

import { RecentGameCard } from './components/RecentGameCard.jsx'
import { HeroGame }       from './components/HeroGame.jsx'
import { StatsStrip }     from './components/StatsStrip.jsx'
import { WPChart }        from './components/WPChart.jsx'
import { GameSwitcher }   from './components/GameSwitcher.jsx'
import { TEAM_COLORS }    from './teamColors.js'

function enrichGame(game) {
  const enrichTeam = t => ({
    ...t,
    color: t.color ?? TEAM_COLORS[t.abbreviation] ?? TEAM_COLORS[t.id] ?? null,
  })
  return {
    ...game,
    homeTeam: enrichTeam(game.homeTeam),
    awayTeam: enrichTeam(game.awayTeam),
  }
}

// Fetch full WP history from ESPN for the chart (model handles current prob)
async function fetchEspnHistory(gameId) {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`
    const data = await fetch(url).then(r => r.json())
    const wpArray = data.winprobability ?? []
    if (wpArray.length < 3) return null

    const history = wpArray.map(p => ({ homeWP: p.homeWinPercentage ?? 0.5 }))

    // Team records from the summary header
    const competitors = data.header?.competitions?.[0]?.competitors ?? []
    const records = {}
    for (const c of competitors) {
      const rec = c.records?.[0]?.summary ?? null
      if (c.team?.id) records[c.team.id] = rec
    }

    return { history, records }
  } catch (_) {
    return null
  }
}

const POLL_INTERVAL        = 7000
const RECENT_POLL_INTERVAL = 60000

export default function App() {
  const [games, setGames]        = useState([])
  const [probs, setProbs]        = useState({})
  const [recentGames, setRecent] = useState([])
  const [error, setError]        = useState(null)
  const [loading, setLoading]    = useState(true)
  const [clockStr, setClock]     = useState('—')
  const [activeId, setActiveId]  = useState(null)

  // WP chart data
  const [wpHistory, setWpHistory]         = useState({})    // live poll history
  const [espnHistory, setEspnHistory]     = useState({})    // ESPN full-game history
  const [teamRecords, setTeamRecords]     = useState({})
  const espnFetched = useRef(new Set())

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

          // Accumulate live WP history for in-progress games
          setWpHistory(prev => {
            const next = { ...prev }
            for (const g of gs) {
              if (g.status !== 'in') continue
              const wp = map[g.id]?.homeWinProbability ?? 0.5
              const arr = (next[g.id] ?? []).slice(-200)
              arr.push({ homeWP: wp })
              next[g.id] = arr
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

  // Fetch ESPN WP history when active game changes (for chart)
  useEffect(() => {
    if (!activeId) return
    if (espnFetched.current.has(activeId)) return
    espnFetched.current.add(activeId)

    fetchEspnHistory(activeId).then(result => {
      if (!result) return
      setEspnHistory(prev => ({ ...prev, [activeId]: result.history }))
      if (Object.keys(result.records).length > 0) {
        setTeamRecords(prev => ({ ...prev, ...result.records }))
      }
    })
  }, [activeId])

  const allGames   = [...games, ...recentGames.filter(r => !games.find(g => g.id === r.id))]
  const liveCount  = games.filter(g => g.status === 'in').length
  const activeGame = allGames.find(g => g.id === activeId) ?? allGames[0] ?? null
  const activeProb = activeGame ? probs[activeGame.id] : null

  // ESPN history takes priority for the chart (full game); fall back to polled history
  const chartHistory = espnHistory[activeGame?.id] ?? wpHistory[activeGame?.id] ?? []

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
          <span className="masthead-clock">{clockStr} ET</span>
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
              />
            )}

            {/* Key stats strip */}
            {activeGame && (
              <StatsStrip game={activeGame} probability={activeProb} />
            )}

            {/* WP Chart + Linescore */}
            {activeGame && chartHistory.length > 2 && (
              <div className="chart-row">
                <div className="panel-card">
                  <div className="panel-card-head">
                    <div className="panel-card-title">
                      Win Probability ·{' '}
                      {activeGame.status === 'in'
                        ? 'Live'
                        : activeGame.status === 'post'
                        ? 'Final'
                        : 'Pre-Game'}
                    </div>
                    <div className="panel-card-sub">
                      {activeGame.homeTeam.abbreviation} vs {activeGame.awayTeam.abbreviation}
                      {activeGame.status === 'post' && ' · Full Game'}
                    </div>
                  </div>
                  <WPChart
                    history={chartHistory}
                    homeColor={activeGame.homeTeam.color ?? '#cc0000'}
                    awayColor={activeGame.awayTeam.color ?? '#f5a623'}
                    homeAbbr={activeGame.homeTeam.abbreviation}
                    awayAbbr={activeGame.awayTeam.abbreviation}
                  />
                  <div className="chart-legend">
                    <span>
                      <span className="chart-swatch" style={{ background: activeGame.homeTeam.color ?? '#cc0000' }} />
                      {activeGame.homeTeam.abbreviation} (Home)
                    </span>
                    <span>
                      <span className="chart-swatch" style={{ background: activeGame.awayTeam.color ?? '#f5a623' }} />
                      {activeGame.awayTeam.abbreviation} (Away)
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      {activeGame.status === 'in'
                        ? `HOVER TO SCRUB · ${chartHistory.length} FRAMES`
                        : `${chartHistory.length} PLAYS`}
                    </span>
                  </div>
                </div>

                {/* Linescore */}
                {activeGame.homeTeam.linescores?.length > 0 && (
                  <div className="panel-card">
                    <div className="panel-card-head">
                      <div className="panel-card-title">Linescore</div>
                      <div className="panel-card-sub">{activeGame.statusText}</div>
                    </div>
                    <div className="linescore-wrap">
                      <div className="ls-col">
                        <span className="ls-label"> </span>
                        <span className="ls-val" style={{ fontSize: 10, color: 'var(--muted)' }}>{activeGame.homeTeam.abbreviation}</span>
                        <span className="ls-val" style={{ fontSize: 10, color: 'var(--muted)' }}>{activeGame.awayTeam.abbreviation}</span>
                      </div>
                      {activeGame.homeTeam.linescores.map((pts, i) => (
                        <div key={i} className="ls-col">
                          <span className="ls-label">
                            {i < 4 ? `Q${i + 1}` : i === 4 ? 'OT' : `OT${i - 3}`}
                          </span>
                          <span className="ls-val">{pts}</span>
                          <span className="ls-val">{activeGame.awayTeam.linescores?.[i] ?? 0}</span>
                        </div>
                      ))}
                      <div className="ls-col" style={{ marginLeft: 8, borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
                        <span className="ls-label">TOT</span>
                        <span className="ls-val" style={{ color: activeGame.homeTeam.isWinner ? 'var(--text)' : 'var(--muted)', fontWeight: 900 }}>
                          {activeGame.homeTeam.score}
                        </span>
                        <span className="ls-val" style={{ color: activeGame.awayTeam.isWinner ? 'var(--text)' : 'var(--muted)', fontWeight: 900 }}>
                          {activeGame.awayTeam.score}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
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

            <div className="footer-note">
              <span>Win % · Logistic Regression on {activeGame?.status === 'in' ? 'live' : 'pre-game'} team stats</span>
              <span className="footer-arrow">↻ LIVE EVERY 7S</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

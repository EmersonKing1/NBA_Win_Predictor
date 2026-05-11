import { useState, useEffect, useRef } from 'react'
import { RecentGameCard } from './components/RecentGameCard.jsx'
import { HeroGame } from './components/HeroGame.jsx'
import { StatsStrip } from './components/StatsStrip.jsx'
import { WPChart } from './components/WPChart.jsx'
import { GameSwitcher } from './components/GameSwitcher.jsx'
import { TEAM_COLORS } from './teamColors.js'

function enrichGame(game) {
  const enrichTeam = t => ({
    ...t,
    color: TEAM_COLORS[t.abbreviation] ?? TEAM_COLORS[t.id] ?? null,
  })
  return {
    ...game,
    homeTeam: enrichTeam(game.homeTeam),
    awayTeam: enrichTeam(game.awayTeam),
  }
}

const POLL_INTERVAL = 7000
const RECENT_POLL_INTERVAL = 60000

export default function App() {
  const [games, setGames]         = useState([])
  const [probs, setProbs]         = useState({})
  const [recentGames, setRecent]  = useState([])
  const [lastUpdated, setUpdated] = useState(null)
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [clockStr, setClock]      = useState('—')
  const [activeId, setActiveId]   = useState(null)

  // WP history per game for chart
  const [wpHistory, setWpHistory] = useState({})
  const prevProbs = useRef({})

  // live clock tick
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

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const data = await fetch('/games').then(r => r.json())
        const gs = (data.games ?? []).map(enrichGame)
        setGames(gs)
        setError(null)
        if (gs.length > 0) {
          const results = await Promise.allSettled(
            gs.map(g => fetch(`/probability/${g.id}`).then(r => r.json()))
          )
          const map = {}
          results.forEach((r, i) => {
            if (r.status === 'fulfilled') map[gs[i].id] = r.value
          })
          setProbs(map)

          // Append to WP history
          setWpHistory(prev => {
            const next = { ...prev }
            for (const g of gs) {
              const wp = map[g.id]?.homeWinProbability ?? 0.5
              const arr = (next[g.id] ?? []).slice(-200)
              arr.push({ homeWP: wp })
              next[g.id] = arr
            }
            return next
          })

          // Default active to first live game, then first game
          setActiveId(prev => {
            if (prev && gs.find(g => g.id === prev)) return prev
            const live = gs.find(g => g.status === 'in')
            return live ? live.id : gs[0]?.id ?? null
          })
        }
        setUpdated(new Date())
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    const fetchRecent = async () => {
      try {
        const data = await fetch('/recent-games').then(r => r.json())
        setRecent((data.games ?? []).map(enrichGame))
      } catch (_) {}
    }

    fetchLive()
    fetchRecent()
    const liveId   = setInterval(fetchLive,   POLL_INTERVAL)
    const recentId = setInterval(fetchRecent, RECENT_POLL_INTERVAL)
    return () => { clearInterval(liveId); clearInterval(recentId) }
  }, [])

  const liveCount = games.filter(g => g.status === 'in').length
  const activeGame = games.find(g => g.id === activeId) ?? games[0] ?? null
  const activeProb = activeGame ? probs[activeGame.id] : null
  const activeHistory = (activeGame ? wpHistory[activeGame.id] : null) ?? []

  return (
    <div className="app">

      {/* ── Top bar ── */}
      <header className="masthead">
        <div className="brandmark">
          <div className="brand-mark">T</div>
          <div>
            <div className="site-title">TIPOFF <span className="site-title-accent">LIVE</span></div>
          </div>
          <span className="site-subtitle">WIN PROBABILITY ENGINE</span>
        </div>

        <div className="masthead-center">
          {liveCount > 0 && (
            <span className="pulse-pill">LIVE</span>
          )}
        </div>

        <div className="masthead-meta">
          <span>{liveCount > 0 ? `${liveCount} GAMES` : 'NO LIVE GAMES'}</span>
          <span style={{ opacity: .4 }}>·</span>
          <span className="masthead-clock">{clockStr} ET</span>
        </div>
      </header>

      {error ? (
        <div className="error-state">
          <div>BACKEND OFFLINE</div>
          <div className="sub">Run <code>build\Release\nbapred_server.exe</code> then refresh.</div>
        </div>
      ) : loading ? (
        <div className="game-list">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" style={{ height: 80, marginTop: 8 }} />
        </div>
      ) : games.length === 0 ? (
        <div className="empty-state">
          <h2>NO GAMES TODAY</h2>
          <p>Check back during the NBA season for live win probabilities.</p>
        </div>
      ) : (
        <>
          {/* ── Hero ── */}
          {activeGame && (
            <HeroGame game={activeGame} probability={activeProb} />
          )}

          {/* ── Stats strip ── */}
          {activeGame && (
            <StatsStrip game={activeGame} probability={activeProb} />
          )}

          {/* ── WP Chart + Linescore ── */}
          {activeGame && activeHistory.length > 2 && (
            <div className="chart-row">
              <div className="panel-card">
                <div className="panel-card-head">
                  <div className="panel-card-title">Win Probability · Live</div>
                  <div className="panel-card-sub">
                    {activeGame.homeTeam.abbreviation} vs {activeGame.awayTeam.abbreviation}
                  </div>
                </div>
                <WPChart
                  history={activeHistory}
                  homeColor={activeGame.homeTeam.color ?? '#3b82f6'}
                  awayColor={activeGame.awayTeam.color ?? '#f97316'}
                  homeAbbr={activeGame.homeTeam.abbreviation}
                  awayAbbr={activeGame.awayTeam.abbreviation}
                />
                <div className="chart-legend">
                  <span>
                    <span className="chart-swatch" style={{ background: activeGame.homeTeam.color ?? '#3b82f6' }} />
                    {activeGame.homeTeam.abbreviation}
                  </span>
                  <span>
                    <span className="chart-swatch" style={{ background: activeGame.awayTeam.color ?? '#f97316' }} />
                    {activeGame.awayTeam.abbreviation}
                  </span>
                  <span style={{ marginLeft: 'auto' }}>HOVER TO SCRUB · {activeHistory.length} FRAMES</span>
                </div>
              </div>

              {/* Linescore panel */}
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
                          {i < 4 ? `Q${i+1}` : i === 4 ? 'OT' : `OT${i-3}`}
                        </span>
                        <span className="ls-val">{pts}</span>
                        <span className="ls-val">{activeGame.awayTeam.linescores?.[i] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Game switcher ── */}
          <GameSwitcher
            games={games}
            probs={probs}
            activeId={activeId}
            onPick={setActiveId}
          />

          {/* ── Recent results ── */}
          {recentGames.length > 0 && (
            <div className="recent-section">
              <div className="section-header">
                <span className="section-label">Recent Results</span>
              </div>
              <div className="recent-grid">
                {recentGames.map(game => (
                  <RecentGameCard key={game.id} game={game} />
                ))}
              </div>
            </div>
          )}

          <div className="footer-note">
            <span>Win % = score diff · time remaining · home court edge</span>
            <span className="footer-arrow">↻ LIVE EVERY 7S</span>
          </div>
        </>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'

const API = import.meta.env.VITE_BACKEND_URL ?? ''

import { RecentGameCard } from './components/RecentGameCard.jsx'
import { HeroGame } from './components/HeroGame.jsx'
import { StatsStrip } from './components/StatsStrip.jsx'
import { WPChart } from './components/WPChart.jsx'
import { GameSwitcher } from './components/GameSwitcher.jsx'
import { StandingsView } from './components/StandingsView.jsx'
import { StatsView } from './components/StatsView.jsx'
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

// Fetch win-probability history + current WP from ESPN game summary
async function fetchEspnSummary(gameId) {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`
    const data = await fetch(url).then(r => r.json())

    // Win probability history — field is lowercase "winprobability", values are 0–1 decimals
    const wpArray = data.winprobability ?? []
    const history = wpArray.map(p => ({
      homeWP: p.homeWinPercentage ?? 0.5,
    }))

    // Current probability (last entry)
    let currentHomeWP = null
    let currentAwayWP = null
    if (wpArray.length > 0) {
      const last = wpArray[wpArray.length - 1]
      currentHomeWP = last.homeWinPercentage ?? 0.5
      currentAwayWP = 1 - currentHomeWP
    }

    // Team records from the summary header
    const competitors = data.header?.competitions?.[0]?.competitors ?? []
    const records = {}
    for (const c of competitors) {
      const rec = c.records?.[0]?.summary ?? null
      if (c.team?.id) records[c.team.id] = rec
    }

    return { history, currentHomeWP, currentAwayWP, records }
  } catch (_) {
    return null
  }
}

const POLL_INTERVAL = 7000
const RECENT_POLL_INTERVAL = 60000

const TABS = ['Scoreboard', 'Standings', 'Stats']
const TAB_IDS = ['scoreboard', 'standings', 'stats']

export default function App() {
  const [games, setGames]         = useState([])
  const [probs, setProbs]         = useState({})
  const [recentGames, setRecent]  = useState([])
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [clockStr, setClock]      = useState('—')
  const [activeId, setActiveId]   = useState(null)
  const [activeTab, setActiveTab] = useState('scoreboard')

  // Live WP chart history (polling)
  const [wpHistory, setWpHistory] = useState({})

  // ESPN summary data (fetched on demand)
  const [summaryHistory, setSummaryHistory]   = useState({}) // gameId -> [{homeWP}]
  const [summaryProbs, setSummaryProbs]       = useState({}) // gameId -> {homeWP, awayWP}
  const [teamRecords, setTeamRecords]         = useState({}) // teamId -> "W-L"
  const summaryFetched = useRef(new Set())

  // live clock
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
        const data = await fetch(`${API}/games`).then(r => r.json())
        const gs = (data.games ?? []).map(enrichGame)
        setGames(gs)
        setError(null)
        if (gs.length > 0) {
          const results = await Promise.allSettled(
            gs.map(g => fetch(`${API}/probability/${g.id}`).then(r => r.json()))
          )
          const map = {}
          results.forEach((r, i) => {
            if (r.status === 'fulfilled') map[gs[i].id] = r.value
          })
          setProbs(prev => ({ ...prev, ...map }))

          // Build WP history for live/in-progress games
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
            if (prev) return prev   // never override a user's explicit selection
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
        // Populate probs for completed games from embedded data
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

  // Fetch ESPN summary whenever active game changes — gets real WP history + records
  useEffect(() => {
    if (!activeId) return
    if (summaryFetched.current.has(activeId)) return
    summaryFetched.current.add(activeId)

    fetchEspnSummary(activeId).then(result => {
      if (!result) return
      const { history, currentHomeWP, currentAwayWP, records } = result

      if (history.length > 2) {
        setSummaryHistory(prev => ({ ...prev, [activeId]: history }))
      }
      if (currentHomeWP !== null) {
        setSummaryProbs(prev => ({
          ...prev,
          [activeId]: { homeWinProbability: currentHomeWP, awayWinProbability: currentAwayWP }
        }))
      }
      if (Object.keys(records).length > 0) {
        setTeamRecords(prev => ({ ...prev, ...records }))
      }
    })
  }, [activeId])

  // Unified game pool: today's games + recent (no duplicates)
  const allGames = [
    ...games,
    ...recentGames.filter(r => !games.find(g => g.id === r.id)),
  ]

  const liveCount   = games.filter(g => g.status === 'in').length
  const activeGame  = allGames.find(g => g.id === activeId) ?? allGames[0] ?? null

  // Use ESPN summary prob if available, else backend prob, else null
  const activeProb = summaryProbs[activeGame?.id]
    ?? (activeGame ? probs[activeGame.id] : null)

  // Chart history: ESPN summary (full history) takes priority over live polling
  const chartHistory = summaryHistory[activeGame?.id]
    ?? wpHistory[activeGame?.id]
    ?? []

  const handlePick = (id) => {
    setActiveId(id)
    if (activeTab !== 'scoreboard') setActiveTab('scoreboard')
  }

  return (
    <div className="app">

      {/* ── Masthead ── */}
      <header className="masthead">
        <div className="brandmark">
          <div className="brand-mark">T</div>
          <div className="site-title">Tipoff <span className="site-title-accent">Live</span></div>
        </div>

        <div className="masthead-center">
          <nav className="masthead-nav-links">
            {TAB_IDS.map((id, i) => (
              <span
                key={id}
                className={`nav-link${activeTab === id ? ' active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                {TABS[i]}
              </span>
            ))}
          </nav>
        </div>

        <div className="masthead-meta">
          {liveCount > 0 && <span className="pulse-pill">LIVE</span>}
          <span>{liveCount > 0 ? `${liveCount} GAMES` : 'NO LIVE GAMES'}</span>
          <span className="masthead-clock">{clockStr} ET</span>
        </div>
      </header>

      {/* ── Page content ── */}
      <div className="page-content">

        {/* ── STANDINGS TAB ── */}
        {activeTab === 'standings' && <StandingsView />}

        {/* ── STATS TAB ── */}
        {activeTab === 'stats' && <StatsView />}

        {/* ── SCOREBOARD TAB ── */}
        {activeTab === 'scoreboard' && (
          <>
            {error ? (
              <div className="error-state">
                <div>BACKEND OFFLINE</div>
                <div className="sub">Run <code>build\Release\nbapred_server.exe</code> then refresh.</div>
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
                {activeGame && (
                  <HeroGame
                    game={activeGame}
                    probability={activeProb}
                    teamRecords={teamRecords}
                  />
                )}

                {activeGame && (
                  <StatsStrip game={activeGame} probability={activeProb} />
                )}

                {/* ── WP Chart ── */}
                {activeGame && chartHistory.length > 2 && (
                  <div className="chart-row">
                    <div className="panel-card">
                      <div className="panel-card-head">
                        <div className="panel-card-title">Win Probability · {activeGame.status === 'in' ? 'Live' : activeGame.status === 'post' ? 'Final' : 'Pre-Game'}</div>
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
                            : `${chartHistory.length} PLAYS`
                          }
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
                                {i < 4 ? `Q${i+1}` : i === 4 ? 'OT' : `OT${i-3}`}
                              </span>
                              <span className="ls-val">{pts}</span>
                              <span className="ls-val">{activeGame.awayTeam.linescores?.[i] ?? 0}</span>
                            </div>
                          ))}
                          <div className="ls-col" style={{ marginLeft: 8, borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
                            <span className="ls-label">TOT</span>
                            <span className="ls-val" style={{ color: activeGame.homeTeam.isWinner ? 'var(--text)' : 'var(--muted)', fontWeight: 900 }}>{activeGame.homeTeam.score}</span>
                            <span className="ls-val" style={{ color: activeGame.awayTeam.isWinner ? 'var(--text)' : 'var(--muted)', fontWeight: 900 }}>{activeGame.awayTeam.score}</span>
                          </div>
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
                  onPick={handlePick}
                />

                {/* ── Recent results ── */}
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
                  <span>Win % powered by ESPN · {activeGame?.status === 'in' ? 'Live' : 'Historical'} data</span>
                  <span className="footer-arrow">↻ LIVE EVERY 7S</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

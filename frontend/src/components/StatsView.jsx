import { useState, useEffect } from 'react'

const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?seasontype=2'

function getStat(stats, name) {
  return stats?.find(s => s.name === name)
}

function parseAllTeams(data) {
  const teams = []
  const groups = data.children ?? []
  for (const group of groups) {
    for (const entry of group.standings?.entries ?? []) {
      const stats = entry.stats ?? []
      const team  = entry.team ?? {}
      const stat  = (name) => getStat(stats, name)
      teams.push({
        id:     team.id,
        abbr:   team.abbreviation,
        name:   team.shortDisplayName ?? team.displayName,
        logo:   team.logos?.[0]?.href ?? '',
        color:  team.color ? `#${team.color}` : null,
        wins:   stat('wins')?.value ?? 0,
        losses: stat('losses')?.value ?? 0,
        winPct: stat('winPercent')?.value ?? 0,
        ppg:    stat('avgPointsFor')?.value ?? 0,
        opp:    stat('avgPointsAgainst')?.value ?? 0,
        diff:   stat('differential')?.value ?? 0,
        streak: stat('streak')?.displayValue ?? '—',
        home:   stat('home')?.displayValue ?? '—',
        road:   stat('road')?.displayValue ?? '—',
      })
    }
  }
  return teams
}

const CATEGORIES = [
  { key: 'ppg',    label: 'Points Per Game',         unit: 'PPG',  fmt: v => v.toFixed(1) },
  { key: 'opp',    label: 'Opp. Points Per Game',    unit: 'OPP',  fmt: v => v.toFixed(1) },
  { key: 'diff',   label: 'Point Differential',      unit: 'DIFF', fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) },
  { key: 'winPct', label: 'Win Percentage',           unit: 'WIN%', fmt: v => (v * 100).toFixed(1) + '%' },
]

function StatCard({ category, teams }) {
  // All categories start descending (highest value first)
  const sorted = [...teams].sort((a, b) => b[category.key] - a[category.key])
  const maxVal = Math.abs(sorted[0]?.[category.key] ?? 1) || 1
  const minVal = Math.abs(sorted[sorted.length - 1]?.[category.key] ?? 0)
  const range  = maxVal - minVal || 1

  return (
    <div className="stat-leader-card">
      <div className="stat-leader-head">
        <span className="stat-leader-title">{category.label}</span>
        <span className="stat-leader-unit">{category.unit} ↓</span>
      </div>
      <div className="stat-leader-rows stat-leader-rows-scroll">
        {sorted.map((team, i) => {
          const val    = team[category.key]
          const barPct = Math.max(4, ((Math.abs(val) - minVal) / range) * 100)
          return (
            <div key={team.id} className={`stat-leader-row${i === 0 ? ' top' : ''}`}>
              <span className="slr-rank">{i + 1}</span>
              <div className="slr-player">
                {team.logo
                  ? <img className="slr-headshot" src={team.logo} alt={team.abbr}
                      style={{ borderRadius: 4 }}
                      onError={e => { e.target.style.display = 'none' }} />
                  : <div style={{
                      width: 28, height: 28, borderRadius: 4,
                      background: team.color ?? 'var(--panel-3)',
                      display: 'grid', placeItems: 'center',
                      fontSize: 9, fontFamily: 'var(--f-display)',
                      fontWeight: 900, color: 'white', flexShrink: 0,
                    }}>{team.abbr?.slice(0,2)}</div>
                }
                <div className="slr-info">
                  <span className="slr-name">{team.name}</span>
                  <div style={{ height: 3, width: '100%', background: 'var(--panel-3)', borderRadius: 2, marginTop: 3 }}>
                    <div style={{
                      height: '100%',
                      width: barPct + '%',
                      background: team.color ?? 'var(--red)',
                      borderRadius: 2,
                      transition: 'width .4s',
                    }} />
                  </div>
                </div>
              </div>
              <span className={`slr-val${i === 0 ? ' top-val' : ''}`}>{category.fmt(val)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function StatsView() {
  const [teams, setTeams]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetch(ESPN_STANDINGS)
      .then(r => r.json())
      .then(data => { setTeams(parseAllTeams(data)); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="tab-loading">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {[1,2,3,4].map(i => (
          <div key={i} className="skeleton" style={{ height: 360, borderRadius: 8 }} />
        ))}
      </div>
    </div>
  )

  if (error) return <div className="tab-error">Failed to load stats: {error}</div>
  if (!teams?.length) return <div className="tab-error">No stats available.</div>

  return (
    <div className="stats-view">
      <div className="standings-note">All {teams.length} Teams · 2025–26 Regular Season · Descending · Data via ESPN</div>
      <div className="stat-leaders-grid">
        {CATEGORIES.map(cat => (
          <StatCard key={cat.key} category={cat} teams={teams} />
        ))}
      </div>
    </div>
  )
}

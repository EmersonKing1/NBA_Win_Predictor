import { useState, useEffect } from 'react'

const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?seasontype=2'

function getStat(stats, name) {
  return stats?.find(s => s.name === name)
}

function parseEntries(entries) {
  return (entries ?? []).map((entry, rank) => {
    const stats = entry.stats ?? []
    const team  = entry.team ?? {}
    const logo  = team.logos?.[0]?.href ?? ''

    const statVal = (name) => getStat(stats, name)
    return {
      rank: rank + 1,
      id: team.id,
      abbr: team.abbreviation,
      name: team.displayName,
      shortName: team.shortDisplayName ?? team.name,
      logo,
      color: team.color ? `#${team.color}` : null,
      wins:    statVal('wins')?.displayValue ?? statVal('wins')?.value ?? '—',
      losses:  statVal('losses')?.displayValue ?? statVal('losses')?.value ?? '—',
      pct:     statVal('winPercent')?.displayValue ?? '—',
      gb:      statVal('gamesBehind')?.displayValue ?? '—',
      home:    statVal('home')?.displayValue ?? '—',
      away:    statVal('road')?.displayValue ?? statVal('away')?.displayValue ?? '—',
      streak:  statVal('streak')?.displayValue ?? '—',
      l10:     statVal('last10')?.displayValue ?? statVal('lastten')?.displayValue ?? '—',
      ppg:     statVal('pointsFor')?.displayValue ?? '—',
      opp:     statVal('pointsAgainst')?.displayValue ?? '—',
      note:    entry.note ?? null,
    }
  })
}

function parseStandings(data) {
  // ESPN returns standings grouped by conference as children
  const children = data.children ?? data.seasons?.[0]?.types?.[0]?.groups ?? []
  if (children.length > 0) {
    return children.map(child => ({
      name: child.name ?? child.abbreviation ?? 'Conference',
      entries: parseEntries(child.standings?.entries ?? child.entries ?? []),
    }))
  }
  // Flat fallback
  const entries = data.standings?.entries ?? data.entries ?? []
  return [{ name: 'League', entries: parseEntries(entries) }]
}

function StreakBadge({ streak }) {
  if (!streak || streak === '—') return <span style={{ color: 'var(--dim)' }}>—</span>
  const isWin = streak.startsWith('W')
  return (
    <span style={{
      color: isWin ? 'var(--green)' : 'var(--red)',
      fontWeight: 700,
      fontFamily: 'var(--f-mono)',
    }}>{streak}</span>
  )
}

function ConferenceTable({ conference }) {
  return (
    <div className="standings-block">
      <div className="section-header" style={{ marginBottom: 12 }}>
        <span className="section-label">{conference.name}</span>
      </div>
      <div className="standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th className="st-rank">#</th>
              <th className="st-team">Team</th>
              <th>W</th>
              <th>L</th>
              <th>PCT</th>
              <th>GB</th>
              <th>HOME</th>
              <th>AWAY</th>
              <th>PPG</th>
              <th>OPP</th>
              <th>STREAK</th>
            </tr>
          </thead>
          <tbody>
            {conference.entries.map((team) => (
              <tr key={team.id} className="standings-row">
                <td className="st-rank st-muted">{team.rank}</td>
                <td className="st-team-cell">
                  <div className="st-team-inner">
                    {team.logo
                      ? <img className="st-logo" src={team.logo} alt={team.abbr} />
                      : <div className="st-logo-fallback" style={{ background: team.color ?? 'var(--panel-3)' }}>{team.abbr?.slice(0,2)}</div>
                    }
                    <span className="st-name">{team.shortName}</span>
                    <span className="st-abbr">{team.abbr}</span>
                  </div>
                  {team.note && (
                    <span className="st-clinch" style={{ background: `#${team.note.color ?? 'cc0000'}22`, color: `#${team.note.color ?? 'cc0000'}` }}>
                      {team.note.text?.slice(0, 1)}
                    </span>
                  )}
                </td>
                <td className="st-bold">{team.wins}</td>
                <td className="st-muted">{team.losses}</td>
                <td className="st-bold">{team.pct}</td>
                <td className="st-muted">{team.gb}</td>
                <td className="st-muted">{team.home}</td>
                <td className="st-muted">{team.away}</td>
                <td className="st-bold">{team.ppg}</td>
                <td className="st-muted">{team.opp}</td>
                <td><StreakBadge streak={team.streak} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function StandingsView() {
  const [conferences, setConferences] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(ESPN_STANDINGS)
      .then(r => r.json())
      .then(data => {
        setConferences(parseStandings(data))
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="tab-loading">
      <div className="skeleton" style={{ height: 400, borderRadius: 8 }} />
    </div>
  )

  if (error) return (
    <div className="tab-error">Failed to load standings: {error}</div>
  )

  if (!conferences?.length) return (
    <div className="tab-error">No standings data available.</div>
  )

  return (
    <div className="standings-view">
      <div className="standings-note">
        Regular Season · Data via ESPN
      </div>
      {conferences.map(c => (
        <ConferenceTable key={c.name} conference={c} />
      ))}
    </div>
  )
}

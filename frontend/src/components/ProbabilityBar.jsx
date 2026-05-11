export function ProbabilityBar({ homeProb, awayProb, homeAbbr, awayAbbr, status, homeLinescores, awayLinescores }) {
  const homePct = Math.round(homeProb * 100)
  const awayPct = Math.round(awayProb * 100)

  const periods = homeLinescores?.length > 0
    ? homeLinescores.map((_, i) => ({
        label: i < 4 ? `Q${i + 1}` : (i === 4 ? 'OT' : `OT${i - 3}`),
        home: homeLinescores[i],
        away: awayLinescores?.[i] ?? 0,
      }))
    : []

  return (
    <div className="prob-section">
      {/* Hatched probability bar */}
      <div className="pbar" style={{ '--left': homePct }} />

      {/* Labels: home pct left, away pct right */}
      <div className="pbar-labels">
        <span>{homeAbbr}&nbsp;&nbsp;{homePct}%</span>
        <span className="right">{awayPct}%&nbsp;&nbsp;{awayAbbr}</span>
      </div>

      {/* Pre-game note */}
      {status === 'pre' && (
        <div className="prob-pregame-note">
          Pre-tip estimate · home court advantage applied
        </div>
      )}

      {/* Linescore breakdown for final games */}
      {periods.length > 0 && (
        <div className="linescore-wrap">
          <div className="ls-col">
            <span className="ls-label"> </span>
            <span className="ls-val" style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>{homeAbbr}</span>
            <span className="ls-val" style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>{awayAbbr}</span>
          </div>
          {periods.map(p => (
            <div key={p.label} className="ls-col">
              <span className="ls-label">{p.label}</span>
              <span className="ls-val">{p.home}</span>
              <span className="ls-val">{p.away}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

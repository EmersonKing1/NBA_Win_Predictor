import { useState } from 'react'

export function WPChart({ history, homeColor, awayColor, homeAbbr, awayAbbr }) {
  const W = 720, H = 200
  const padL = 34, padR = 10, padT = 10, padB = 10
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const [hover, setHover] = useState(null)

  if (!history || history.length === 0) return null

  const hasTime = history.every(d => d.elapsed !== undefined)
  const maxTime = hasTime ? Math.max(48, ...history.map(d => d.elapsed)) : null
  const multi   = history.length >= 2

  function xOf(d, i) {
    if (hasTime) return padL + (maxTime > 0 ? d.elapsed / maxTime : 0) * innerW
    return padL + (multi ? i / (history.length - 1) : 0) * innerW
  }

  const homePts = history.map((d, i) => ({
    x: xOf(d, i),
    y: padT + (1 - d.homeWP) * innerH,
    homeWP: d.homeWP,
  }))
  const awayPts = homePts.map(p => ({ x: p.x, y: padT + p.homeWP * innerH }))

  const toPath = pts =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  const homeLinePath = multi ? toPath(homePts) : null
  const awayLinePath = multi ? toPath(awayPts) : null

  const qDividers = hasTime
    ? [12, 24, 36].filter(t => t < maxTime).map(t => padL + (t / maxTime) * innerW)
    : [0.25, 0.5, 0.75].map(f => padL + f * innerW)

  function onMove(e) {
    if (!multi) return
    const rect = e.currentTarget.getBoundingClientRect()
    const xRel = ((e.clientX - rect.left) / rect.width) * W
    if (xRel < padL || xRel > W - padR) { setHover(null); return }
    let closest = 0, minDist = Infinity
    homePts.forEach((p, i) => {
      const d = Math.abs(p.x - xRel)
      if (d < minDist) { minDist = d; closest = i }
    })
    setHover({
      x:     homePts[closest].x,
      yHome: homePts[closest].y,
      yAway: awayPts[closest].y,
      wp:    homePts[closest].homeWP,
    })
  }

  return (
    <div className="chart-wrap" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">

        {/* Chart area background */}
        <rect x={padL} y={padT} width={innerW} height={innerH} fill="#f9fafb" />

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.75, 1].map(g => (
          <line key={g}
            x1={padL} x2={W - padR}
            y1={padT + g * innerH} y2={padT + g * innerH}
            stroke="#e5e7eb" strokeWidth="1"
          />
        ))}

        {/* 50% midline — slightly stronger */}
        <line
          x1={padL} x2={W - padR}
          y1={padT + 0.5 * innerH} y2={padT + 0.5 * innerH}
          stroke="#d1d5db" strokeWidth="1"
        />

        {/* Quarter dividers */}
        {qDividers.map((x, i) => (
          <line key={i}
            x1={x} x2={x} y1={padT} y2={padT + innerH}
            stroke="#e5e7eb" strokeWidth="1"
          />
        ))}

        {/* Y-axis labels */}
        {[100, 75, 50, 25, 0].map(pct => (
          <text key={pct}
            x={padL - 5}
            y={padT + (1 - pct / 100) * innerH + 3.5}
            fill="#9ca3af"
            fontSize="8"
            fontFamily="JetBrains Mono, ui-monospace, monospace"
            fontWeight="500"
            textAnchor="end"
          >{pct}%</text>
        ))}

        {/* Pregame: faint dashed reference at each team's starting odds */}
        {!multi && (
          <>
            <line x1={padL} x2={W - padR} y1={homePts[0].y} y2={homePts[0].y}
              stroke={homeColor} strokeOpacity="0.22" strokeDasharray="5 8" strokeWidth="1" />
            <line x1={padL} x2={W - padR} y1={awayPts[0].y} y2={awayPts[0].y}
              stroke={awayColor} strokeOpacity="0.22" strokeDasharray="5 8" strokeWidth="1" />
          </>
        )}

        {/* Away line — drawn first, home sits on top */}
        {multi && awayLinePath && (
          <path d={awayLinePath} fill="none"
            stroke={awayColor} strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round"
            opacity="0.8"
          />
        )}

        {/* Home line */}
        {multi && homeLinePath && (
          <path d={homeLinePath} fill="none"
            stroke={homeColor} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* Start dot — pregame anchor on left edge */}
        <circle cx={homePts[0].x} cy={homePts[0].y} r="3" fill={homeColor} />
        <circle cx={awayPts[0].x} cy={awayPts[0].y} r="2.5" fill={awayColor} opacity="0.8" />

        {/* Live / current dot — open ring at the rightmost point */}
        {multi && (
          <>
            <circle cx={homePts.at(-1).x} cy={homePts.at(-1).y}
              r="5" fill="white" stroke={homeColor} strokeWidth="2" />
            <circle cx={awayPts.at(-1).x} cy={awayPts.at(-1).y}
              r="3.5" fill="white" stroke={awayColor} strokeWidth="1.5" opacity="0.8" />
          </>
        )}

        {/* Hover: hairline + precise dots */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH}
              stroke="#9ca3af" strokeWidth="1" />
            <circle cx={hover.x} cy={hover.yAway} r="3" fill="white" stroke={awayColor} strokeWidth="1.5" />
            <circle cx={hover.x} cy={hover.yHome} r="3.5" fill="white" stroke={homeColor} strokeWidth="2" />
          </>
        )}
      </svg>

      {hover && (
        <div className="chart-cursor-info">
          <span style={{ color: homeColor }}>{homeAbbr} {(hover.wp * 100).toFixed(1)}%</span>
          <span className="chart-cursor-sep">·</span>
          <span style={{ color: awayColor }}>{awayAbbr} {((1 - hover.wp) * 100).toFixed(1)}%</span>
        </div>
      )}
      <div className="chart-q-marks">
        <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
      </div>
    </div>
  )
}

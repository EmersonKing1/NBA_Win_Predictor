import { useState } from 'react'

export function WPChart({ history, homeColor, awayColor, homeAbbr, awayAbbr }) {
  const W = 720, H = 240
  const padL = 38, padR = 14, padT = 14, padB = 18
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const [hover, setHover] = useState(null)

  if (!history || history.length < 2) return null

  // Home line: high = home winning (y near padT)
  const homePts = history.map((d, i) => ({
    x: padL + (i / (history.length - 1)) * innerW,
    y: padT + (1 - d.homeWP) * innerH,
    homeWP: d.homeWP,
  }))

  // Away line: exact mirror of home around the 50% axis
  const awayPts = homePts.map(p => ({ x: p.x, y: padT + p.homeWP * innerH }))

  const homeLinePath = homePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const awayLinePath = awayPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  // Fills use the home line as the boundary (correct: home fill below, away fill above)
  const fillHome = `${homeLinePath} L ${homePts.at(-1).x} ${padT + innerH} L ${homePts[0].x} ${padT + innerH} Z`
  const fillAway = `${homeLinePath} L ${homePts.at(-1).x} ${padT} L ${homePts[0].x} ${padT} Z`

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const xRel = ((e.clientX - rect.left) / rect.width) * W
    if (xRel < padL || xRel > W - padR) { setHover(null); return }
    const i = Math.max(0, Math.min(homePts.length - 1,
      Math.round(((xRel - padL) / innerW) * (history.length - 1))
    ))
    setHover({
      x:     homePts[i].x,
      yHome: homePts[i].y,
      yAway: awayPts[i].y,
      wp:    homePts[i].homeWP,
    })
  }

  const hFillId  = `hf_${homeAbbr}`
  const aFillId  = `af_${awayAbbr}`
  const hGlowId  = `hg_${homeAbbr}`
  const aGlowId  = `ag_${awayAbbr}`

  return (
    <div className="chart-wrap" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={hFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={homeColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={homeColor} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={aFillId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%"   stopColor={awayColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={awayColor} stopOpacity="0.02" />
          </linearGradient>
          <filter id={hGlowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={aGlowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map(g => (
          <line key={g}
            x1={padL} x2={W - padR}
            y1={padT + g * innerH} y2={padT + g * innerH}
            stroke={g === 0.5 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}
            strokeDasharray={g === 0.5 ? '' : '2 4'}
          />
        ))}
        {/* Y-axis labels */}
        {[1, 0.75, 0.5, 0.25, 0].map(g => (
          <text key={g}
            x={padL - 8} y={padT + (1 - g) * innerH + 3}
            fill="rgba(255,255,255,0.35)" fontSize="9"
            fontFamily="JetBrains Mono, monospace" textAnchor="end"
          >{Math.round(g * 100)}%</text>
        ))}
        {/* Quarter dividers */}
        {[0.25, 0.5, 0.75].map((g, i) => (
          <line key={i}
            x1={padL + g * innerW} x2={padL + g * innerW}
            y1={padT} y2={padT + innerH}
            stroke="rgba(255,255,255,0.10)" strokeDasharray="3 4"
          />
        ))}

        {/* Fills */}
        <path d={fillAway} fill={`url(#${aFillId})`} />
        <path d={fillHome} fill={`url(#${hFillId})`} />

        {/* 50% center reference */}
        <line
          x1={padL} x2={W - padR}
          y1={padT + 0.5 * innerH} y2={padT + 0.5 * innerH}
          stroke="rgba(255,255,255,0.22)"
        />

        {/* Away line — drawn first so home line sits on top */}
        <path d={awayLinePath} fill="none"
          stroke={awayColor} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round"
          filter={`url(#${aGlowId})`}
        />
        {/* Home line */}
        <path d={homeLinePath} fill="none"
          stroke={homeColor} strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round"
          filter={`url(#${hGlowId})`}
        />

        {/* End dots */}
        <circle cx={awayPts.at(-1).x} cy={awayPts.at(-1).y}
          r="4" fill={awayColor} stroke="white" strokeWidth="1.5" />
        <circle cx={homePts.at(-1).x} cy={homePts.at(-1).y}
          r="5.5" fill={homeColor} stroke="white" strokeWidth="2" />

        {/* Hover crosshair */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH}
              stroke="rgba(255,255,255,0.35)" strokeDasharray="2 3" strokeWidth="1.5" />
            <circle cx={hover.x} cy={hover.yAway} r="3.5" fill="white" stroke={awayColor} strokeWidth="1.5" />
            <circle cx={hover.x} cy={hover.yHome} r="4.5" fill="white" stroke={homeColor} strokeWidth="2" />
          </>
        )}
      </svg>

      {hover && (
        <div className="chart-cursor-info">
          <span style={{ color: homeColor }}>{homeAbbr} {(hover.wp * 100).toFixed(1)}%</span>
          {' · '}
          <span style={{ color: awayColor }}>{awayAbbr} {((1 - hover.wp) * 100).toFixed(1)}%</span>
        </div>
      )}
      <div className="chart-q-marks">
        <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
      </div>
    </div>
  )
}

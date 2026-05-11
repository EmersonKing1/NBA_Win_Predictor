import { useState } from 'react'

export function WPChart({ history, homeColor, awayColor, homeAbbr, awayAbbr }) {
  const W = 720, H = 220
  const padL = 38, padR = 14, padT = 14, padB = 18
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const [hover, setHover] = useState(null)

  if (!history || history.length < 2) return null

  const pts = history.map((d, i) => {
    const x = padL + (i / (history.length - 1)) * innerW
    const y = padT + (1 - d.homeWP) * innerH
    return { x, y, homeWP: d.homeWP }
  })

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const fillHome = `${linePath} L ${pts[pts.length - 1].x} ${padT + innerH} L ${pts[0].x} ${padT + innerH} Z`

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const xRel = ((e.clientX - rect.left) / rect.width) * W
    if (xRel < padL || xRel > W - padR) { setHover(null); return }
    const i = Math.round(((xRel - padL) / innerW) * (history.length - 1))
    const clamped = Math.max(0, Math.min(pts.length - 1, i))
    setHover({ x: pts[clamped].x, y: pts[clamped].y, wp: pts[clamped].homeWP })
  }

  return (
    <div className="chart-wrap" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="homeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={homeColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={homeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map(g => (
          <line key={g}
            x1={padL} x2={W - padR}
            y1={padT + g * innerH} y2={padT + g * innerH}
            stroke={g === 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}
            strokeDasharray={g === 0.5 ? '' : '2 4'}
          />
        ))}
        {/* y labels */}
        {[1, 0.75, 0.5, 0.25, 0].map(g => (
          <text key={g}
            x={padL - 8} y={padT + (1 - g) * innerH + 3}
            fill="rgba(255,255,255,0.4)"
            fontSize="9" fontFamily="JetBrains Mono"
            textAnchor="end"
          >{Math.round(g * 100)}%</text>
        ))}
        {/* quarter dividers — shown at 25/50/75% of time axis */}
        {[0.25, 0.5, 0.75].map((g, i) => (
          <line key={i}
            x1={padL + g * innerW} x2={padL + g * innerW}
            y1={padT} y2={padT + innerH}
            stroke="rgba(255,255,255,0.10)" strokeDasharray="3 4"
          />
        ))}
        {/* area fill */}
        <path d={fillHome} fill="url(#homeFill)" />
        {/* line */}
        <path d={linePath} fill="none" stroke={homeColor} strokeWidth="2.5" strokeLinejoin="round" />
        {/* current dot */}
        <circle
          cx={pts[pts.length - 1].x}
          cy={pts[pts.length - 1].y}
          r="5" fill={homeColor} stroke="white" strokeWidth="2"
        />
        {/* hover */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH}
              stroke="rgba(255,255,255,0.4)" strokeDasharray="2 3" />
            <circle cx={hover.x} cy={hover.y} r="4" fill="white" />
          </>
        )}
      </svg>
      {hover && (
        <div className="chart-cursor-info">
          {homeAbbr} {Math.round(hover.wp * 100)}% · {awayAbbr} {Math.round((1 - hover.wp) * 100)}%
        </div>
      )}
      <div className="chart-q-marks">
        <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
      </div>
    </div>
  )
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

export function colorDist(a, b) {
  const [r1,g1,b1] = hexToRgb(a), [r2,g2,b2] = hexToRgb(b)
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2)
}

export function distinctAwayColor(homeHex, awayHex) {
  if (!homeHex || !awayHex) return awayHex
  if (colorDist(homeHex, awayHex) < 60) {
    const [r,g,b] = hexToRgb(awayHex)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    const shift = brightness < 128 ? 100 : -100
    return '#' + [r,g,b]
      .map(v => Math.min(255, Math.max(0, Math.round(v + shift))).toString(16).padStart(2,'0'))
      .join('')
  }
  return awayHex
}

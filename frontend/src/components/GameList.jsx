import { GameCard } from './GameCard.jsx'

function SkeletonCard({ tilt }) {
  return <div className={`skeleton skeleton-card${tilt ? ' ' + tilt : ''}`} />
}

export function GameList({ games, probs, loading }) {
  if (loading) {
    return (
      <div className="game-list">
        <SkeletonCard tilt="tilt-l" />
        <SkeletonCard tilt="tilt-r" />
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <div className="empty-state">
        <h2>No games today</h2>
        <p>Check back during the NBA season for live win probabilities.</p>
      </div>
    )
  }

  const sorted = [...games].sort((a, b) => {
    const order = { in: 0, pre: 1, post: 2 }
    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
  })

  return (
    <div className="game-list">
      {sorted.map(game => (
        <GameCard key={game.id} game={game} probability={probs[game.id]} />
      ))}
    </div>
  )
}

import GameCard from "./GameCard";

export default function GamesGrid({
  games,
  draftSelections,
  pendingGameIds,
  denseMode,
  onToggleSub,
  onToggleAttendance,
  isMyGame
}) {
  return (
    <div
      className={`grid grid-cols-1 ${
        denseMode
          ? "gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "gap-3 sm:grid-cols-2 xl:grid-cols-3"
      }`}
    >
      {games.map((game, index) => (
        <GameCard
          key={game.gameId || `game-${index}`}
          game={game}
          selection={draftSelections[game.gameId] || {}}
          pending={pendingGameIds?.has(game.gameId)}
          denseMode={denseMode}
          isMyGame={isMyGame?.(game)}
          onToggleSub={() => onToggleSub(game.gameId)}
          onToggleAttendance={(value) => onToggleAttendance(game.gameId, value)}
        />
      ))}
    </div>
  );
}

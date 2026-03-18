import GameCard from "./GameCard";

export default function GamesGrid({
  games,
  draftSelections,
  hiddenGames,
  denseMode,
  onToggleSub,
  onToggleAttendance,
  onToggleHidden
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
          hidden={Boolean(hiddenGames[game.gameId])}
          denseMode={denseMode}
          onToggleSub={() => onToggleSub(game.gameId)}
          onToggleAttendance={(value) => onToggleAttendance(game.gameId, value)}
          onToggleHidden={() => onToggleHidden(game.gameId)}
        />
      ))}
    </div>
  );
}

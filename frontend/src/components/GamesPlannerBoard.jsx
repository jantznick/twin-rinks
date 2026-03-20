import { useState } from "react";
import GameCard from "./GameCard";

export default function GamesPlannerBoard({
  buckets,
  draftSelections,
  pendingGameIds,
  denseMode,
  onToggleSub,
  onToggleAttendance,
  isMyGamesTab
}) {
  const [collapsedDays, setCollapsedDays] = useState({});

  const toggleDay = (key) => {
    setCollapsedDays((previous) => ({
      ...previous,
      [key]: !previous[key]
    }));
  };

  return (
    <div className="space-y-3">
      {buckets.map((bucket) => (
        <section key={bucket.key} className="pt-2">
          <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
            {bucket.games.length === 0 ? (
              <p className="text-sm font-semibold text-slate-800">{bucket.label}</p>
            ) : (
              <button
                type="button"
                onClick={() => toggleDay(bucket.key)}
                className="inline-flex items-center gap-2 text-left text-sm font-semibold text-slate-800"
              >
                <span>{collapsedDays[bucket.key] ? "▸" : "▾"}</span>
                <span>{bucket.label}</span>
              </button>
            )}
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
              {bucket.games.length === 0
                ? "No games available"
                : `${bucket.games.length} games`}
            </span>
          </div>

          {bucket.games.length === 0 || collapsedDays[bucket.key] ? null : (
            <div
              className={`grid grid-cols-1 ${
                denseMode
                  ? "gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  : "gap-3 sm:grid-cols-2 xl:grid-cols-3"
              }`}
            >
              {bucket.games.map((game, index) => (
                <GameCard
                  key={game.gameId || `${bucket.key}-${index}`}
                  game={game}
                  selection={draftSelections[game.gameId] || {}}
                  pending={pendingGameIds?.has(game.gameId)}
                  denseMode={denseMode}
                  timeOnly
                  isMyGamesTab={isMyGamesTab}
                  onToggleSub={() => onToggleSub(game.gameId)}
                  onToggleAttendance={(value) => onToggleAttendance(game.gameId, value)}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

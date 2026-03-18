import { useMemo, useState } from "react";
import GameCard from "./GameCard";
import GamesPlannerBoard from "./GamesPlannerBoard";
import GamesWeekBoard from "./GamesWeekBoard";
import {
  buildPlannerBuckets,
  getCountdownText,
  getGameHeadline,
  getGameNote,
  getOptionValues,
  getRink,
  getScheduleText,
  getStatusLabel,
  groupGamesByDate
} from "../lib/gameUtils";

export default function GamesCalendarView({
  games,
  draftSelections,
  hiddenGames,
  denseMode,
  onToggleSub,
  onToggleAttendance,
  onToggleHidden
}) {
  const groups = groupGamesByDate(games);
  const plannerBuckets = useMemo(() => buildPlannerBuckets(games, 14), [games]);
  const [layoutMode, setLayoutMode] = useState("planner");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [selectedGame, setSelectedGame] = useState(null);

  const toggleGroup = (key) => {
    setCollapsedGroups((previous) => ({
      ...previous,
      [key]: !previous[key]
    }));
  };

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        <button
          type="button"
          onClick={() => setLayoutMode("planner")}
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
            layoutMode === "planner"
              ? "bg-indigo-600 text-white"
              : "text-slate-700 hover:bg-slate-50"
          }`}
        >
          Planner
        </button>
        <button
          type="button"
          onClick={() => setLayoutMode("week")}
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
            layoutMode === "week"
              ? "bg-indigo-600 text-white"
              : "text-slate-700 hover:bg-slate-50"
          }`}
        >
          Week
        </button>
        <button
          type="button"
          onClick={() => setLayoutMode("grouped")}
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
            layoutMode === "grouped"
              ? "bg-indigo-600 text-white"
              : "text-slate-700 hover:bg-slate-50"
          }`}
        >
          Grouped
        </button>
      </div>

      {layoutMode === "planner" ? (
        <GamesPlannerBoard
          buckets={plannerBuckets}
          draftSelections={draftSelections}
          hiddenGames={hiddenGames}
          denseMode={denseMode}
          onToggleSub={onToggleSub}
          onToggleAttendance={onToggleAttendance}
          onToggleHidden={onToggleHidden}
        />
      ) : layoutMode === "week" ? (
        <GamesWeekBoard games={games} onSelectGame={setSelectedGame} />
      ) : (
        groups.map((group) => (
          <section
            key={group.key}
            className="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-md shadow-slate-200/40"
          >
            <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2">
              {group.games.length === 0 ? (
                <p className="text-sm font-semibold text-slate-800">{group.label}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="inline-flex items-center gap-2 text-left text-sm font-semibold text-slate-800"
                >
                  <span>{collapsedGroups[group.key] ? "▸" : "▾"}</span>
                  <span>{group.label}</span>
                </button>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {group.games.length === 0
                  ? "No games available"
                  : `${group.games.length} games`}
              </span>
            </div>

            {group.games.length === 0 || collapsedGroups[group.key] ? null : (
              <div
                className={`grid grid-cols-1 ${
                  denseMode
                    ? "gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    : "gap-3 sm:grid-cols-2 xl:grid-cols-3"
                }`}
              >
                {group.games.map((game, index) => (
                  <GameCard
                    key={game.gameId || `${group.key}-${index}`}
                    game={game}
                    selection={draftSelections[game.gameId] || {}}
                    hidden={Boolean(hiddenGames[game.gameId])}
                    denseMode={denseMode}
                    timeOnly
                    onToggleSub={() => onToggleSub(game.gameId)}
                    onToggleAttendance={(value) =>
                      onToggleAttendance(game.gameId, value)
                    }
                    onToggleHidden={() => onToggleHidden(game.gameId)}
                  />
                ))}
              </div>
            )}
          </section>
        ))
      )}

      {selectedGame ? (
        <GameDetailsModal
          game={selectedGame}
          hidden={Boolean(hiddenGames[selectedGame.gameId])}
          selection={draftSelections[selectedGame.gameId] || {}}
          onToggleSub={() => onToggleSub(selectedGame.gameId)}
          onToggleAttendance={(value) =>
            onToggleAttendance(selectedGame.gameId, value)
          }
          onToggleHidden={() => onToggleHidden(selectedGame.gameId)}
          onClose={() => setSelectedGame(null)}
        />
      ) : null}
    </div>
  );
}

function GameDetailsModal({
  game,
  hidden,
  selection,
  onToggleSub,
  onToggleAttendance,
  onToggleHidden,
  onClose
}) {
  const status = getStatusLabel(game, selection);
  const rink = getRink(game);
  const countdown = getCountdownText(game);
  const options = getOptionValues(game);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {getScheduleText(game)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {rink ? `${rink} rink` : "Rink unknown"}
              {countdown ? ` • ${countdown}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            Close
          </button>
        </div>

        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium text-slate-800">{getGameHeadline(game)}</p>
          {getGameNote(game) ? (
            <p className="text-xs text-slate-600">{getGameNote(game)}</p>
          ) : null}
          <p className="text-xs text-slate-600">
            Current status: <span className="font-semibold">{status}</span>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {options.has("SUB") ? (
              <button
                type="button"
                onClick={onToggleSub}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  selection?.sub
                    ? "bg-sky-600 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                {selection?.sub ? "Sub selected" : "I can sub"}
              </button>
            ) : null}
            {options.has("IN") ? (
              <button
                type="button"
                onClick={() => onToggleAttendance("IN")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  selection?.attendance === "IN"
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                IN
              </button>
            ) : null}
            {options.has("OUT") ? (
              <button
                type="button"
                onClick={() => onToggleAttendance("OUT")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  selection?.attendance === "OUT"
                    ? "bg-amber-600 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                OUT
              </button>
            ) : null}
            <button
              type="button"
              onClick={onToggleHidden}
              className="ml-auto rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700"
            >
              {hidden ? "Unhide" : "Hide"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

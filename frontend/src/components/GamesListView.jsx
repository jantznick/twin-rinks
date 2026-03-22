import {
  getGameHeadline,
  getOptionValues,
  getRink,
  getScheduleText,
  getStatusLabel,
  getSubJerseyGuide,
  formatDateKey
} from "../lib/gameUtils";

export default function GamesListView({
  games,
  draftSelections,
  pendingGameIds,
  onToggleSub,
  onToggleAttendance,
  isMyGamesTab
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <ul className="divide-y divide-slate-200">
        {games.map((game, index) => {
          const selection = draftSelections[game.gameId] || {};
          const options = getOptionValues(game);
          const status = getStatusLabel(game, selection);
          const isPlaying = game?.stage === "selected" || game?.stage === "confirmed-in" || game?.stage === "sub-requested" || selection?.attendance === "IN";
          const jerseyGuide = isMyGamesTab || isPlaying ? getSubJerseyGuide(game) : null;
          const isGameToday = game?.schedule?.date === formatDateKey(new Date());

          return (
            <li
              key={game.gameId || `list-${index}`}
              className={`flex flex-col gap-2 px-2 py-2.5 md:flex-row md:items-center md:justify-between ${
                pendingGameIds?.has(game.gameId)
                  ? "bg-amber-50/70"
                  : isPlaying && !isMyGamesTab
                  ? "bg-emerald-50/30"
                  : isGameToday
                  ? "bg-rose-50/30"
                  : ""
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {getScheduleText(game)}
                  {getRink(game) ? ` • ${getRink(game)} rink` : ""}
                </p>
                <p className="truncate text-xs text-slate-600">{getGameHeadline(game)}</p>
                {jerseyGuide ? (
                  <p className="mt-0.5 text-[11px] font-medium text-indigo-700">
                    {jerseyGuide.text}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{status}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {options.has("SUB") ? (
                  <button
                    type="button"
                    onClick={() => onToggleSub(game.gameId)}
                    className={`rounded px-2 py-1 text-[11px] font-medium ${
                      selection?.sub
                        ? "bg-sky-600 text-white"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    SUB
                  </button>
                ) : null}
                {options.has("IN") ? (
                  <button
                    type="button"
                    onClick={() => onToggleAttendance(game.gameId, "IN")}
                    className={`rounded px-2 py-1 text-[11px] font-medium ${
                      selection?.attendance === "IN"
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    IN
                  </button>
                ) : null}
                {selection?.attendance === "OUT" ? (
                  <button
                    type="button"
                    onClick={() => onToggleAttendance(game.gameId, "OUT")}
                    className="rounded px-2 py-1 text-[11px] font-medium bg-slate-200 text-slate-800"
                  >
                    UNHIDE
                  </button>
                ) : options.has("OUT") ? (
                  <button
                    type="button"
                    onClick={() => onToggleAttendance(game.gameId, "OUT")}
                    className="rounded px-2 py-1 text-[11px] font-medium border border-slate-300 bg-white text-slate-700"
                  >
                    OUT
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import {
  getGameHeadline,
  getOptionValues,
  getRink,
  getScheduleText,
  getStatusLabel
} from "../lib/gameUtils";

export default function GamesListView({
  games,
  draftSelections,
  pendingGameIds,
  onToggleSub,
  onToggleAttendance
}) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/90 p-2 shadow-md shadow-slate-200/40">
      <ul className="divide-y divide-slate-200">
        {games.map((game, index) => {
          const selection = draftSelections[game.gameId] || {};
          const options = getOptionValues(game);
          const status = getStatusLabel(game, selection);
          return (
            <li
              key={game.gameId || `list-${index}`}
              className={`flex flex-col gap-2 px-2 py-2.5 md:flex-row md:items-center md:justify-between ${
                pendingGameIds?.has(game.gameId) ? "bg-amber-50/70" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {getScheduleText(game)}
                  {getRink(game) ? ` • ${getRink(game)} rink` : ""}
                </p>
                <p className="truncate text-xs text-slate-600">{getGameHeadline(game)}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{status}</p>
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
                {options.has("OUT") ? (
                  <button
                    type="button"
                    onClick={() => onToggleAttendance(game.gameId, "OUT")}
                    className={`rounded px-2 py-1 text-[11px] font-medium ${
                      selection?.attendance === "OUT"
                        ? "bg-amber-600 text-white"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
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

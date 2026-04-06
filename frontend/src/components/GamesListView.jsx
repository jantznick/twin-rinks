import {
  getGameHeadline,
  getOptionValues,
  getRink,
  getScheduleText,
  getStatusLabel,
  getSubJerseyGuide,
  formatDateKey,
  getStatusPillClasses,
  getRinkPillClasses,
  getGameNote,
  getSubSpotState
} from "../lib/gameUtils";
import LeagueSourceBadge from "./LeagueSourceBadge";

export default function GamesListView({
  games,
  draftSelections,
  pendingGameIds,
  onToggleSub,
  onToggleAttendance,
  isMyGame
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <ul className="flex flex-col">
        {games.map((game, index) => {
          const selection = draftSelections[game.gameId] || {};
          const options = getOptionValues(game);
          const status = getStatusLabel(game, selection);
          const isPlaying = game?.stage === "selected" || game?.stage === "confirmed-in" || game?.stage === "sub-requested" || selection?.attendance === "IN";
          const subSpotState = getSubSpotState(game);
          const isSubRequestedFilled = game?.stage === "sub-requested" && subSpotState === "filled";
          const myRow = isMyGame?.(game);
          const jerseyGuide = myRow || isPlaying ? getSubJerseyGuide(game) : null;
          const isGameToday = game?.schedule?.date === formatDateKey(new Date());
          
          const statusPill = status ? getStatusPillClasses(status) : "";
          const rink = getRink(game);
          const rinkPillClasses = getRinkPillClasses(rink);

          let borderClass = "border-l-4 border-transparent border-b border-b-slate-200 last:border-b-0";
          let bgClass = "bg-white hover:bg-slate-50";

          if (pendingGameIds?.has(game.gameId)) {
            borderClass = "border-l-4 border-l-amber-400 border-b border-b-amber-200 last:border-b-0";
            bgClass = "bg-amber-50/50";
          } else if (myRow) {
            borderClass =
              "border-l-4 border-l-blue-600 border-b border-b-slate-200 last:border-b-0";
            bgClass = "bg-blue-50/40 hover:bg-blue-50/55";
          } else if (isSubRequestedFilled) {
            borderClass = "border-l-4 border-l-sky-500 border-b border-b-sky-200 last:border-b-0";
            bgClass = "bg-sky-50/40";
          } else if (isPlaying) {
            borderClass = "border-l-4 border-l-emerald-500 border-b border-b-emerald-200 last:border-b-0";
            bgClass = "bg-emerald-50/30";
          } else if (isGameToday) {
            borderClass = "border-l-4 border-l-rose-500 border-b border-b-rose-200 last:border-b-0";
            bgClass = "bg-rose-50/30";
          }

          return (
            <li
              key={game.gameId || `list-${index}`}
              className={`flex flex-col gap-3 px-3 py-3.5 sm:flex-row sm:items-start sm:gap-5 transition ${borderClass} ${bgClass}`}
            >
              <div className="shrink-0 sm:w-44">
                <p className="text-sm font-bold text-slate-900">
                  {getScheduleText(game)}
                </p>
                {rink && (
                  <div className="mt-1">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${rinkPillClasses}`}>
                      {rink} rink
                    </span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {getGameHeadline(game)}
                  </p>
                  <LeagueSourceBadge game={game} />
                  {status ? (
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 whitespace-nowrap ${statusPill}`}>
                      {status}
                    </span>
                  ) : null}
                </div>
                
                {getGameNote(game) ? (
                  <p className="mt-1 text-sm text-slate-600">{getGameNote(game)}</p>
                ) : null}
                
                {jerseyGuide ? (
                  <p className="mt-1 text-sm font-medium text-indigo-700">
                    {jerseyGuide.text}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {options.has("SUB") &&
                  game?.stage !== "selected" &&
                  game?.stage !== "confirmed-in" &&
                  game?.stage !== "sub-requested" ? (
                    <button
                      type="button"
                      onClick={() => onToggleSub(game.gameId)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        selection?.sub
                          ? "bg-sky-600 text-white hover:bg-sky-700"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {game?.stage === "sub-requested" && selection?.sub
                        ? subSpotState === "filled"
                          ? "Sub requested (filled)"
                          : "Sub requested"
                        : "I can sub"}
                    </button>
                  ) : null}

                  {options.has("IN") ? (
                    <button
                      type="button"
                      onClick={() => onToggleAttendance(game.gameId, "IN")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        selection?.attendance === "IN"
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      IN
                    </button>
                  ) : null}

                  {selection?.attendance === "OUT" ? (
                    <button
                      type="button"
                      onClick={() => onToggleAttendance(game.gameId, "")}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium transition bg-slate-200 text-slate-800 hover:bg-slate-300"
                    >
                      Unhide
                    </button>
                  ) : options.has("OUT") ? (
                    <button
                      type="button"
                      onClick={() =>
                        onToggleAttendance(
                          game.gameId,
                          game?.stage === "sub-requested" || selection?.sub
                            ? ""
                            : "OUT"
                        )
                      }
                      className="rounded-lg px-3 py-1.5 text-xs font-medium transition border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      {game?.stage === "sub-requested" || selection?.sub
                        ? "Cancel Sub"
                        : "OUT"}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import {
  getCountdownText,
  getGameHeadline,
  getGameNote,
  getOptionValues,
  getRink,
  getScheduleText,
  getTimeText,
  getStatusLabel,
  getStatusPillClasses,
  getSubSpotState,
  getSubJerseyGuide,
  formatDateKey,
  getRinkPillClasses
} from "../lib/gameUtils";
import LeagueSourceBadge from "./LeagueSourceBadge";

export default function GameCard({
  game,
  selection,
  pending,
  denseMode,
  timeOnly,
  onToggleSub,
  onToggleAttendance,
  isMyGame = false
}) {
  const statusLabel = getStatusLabel(game, selection);
  const statusPill = getStatusPillClasses(statusLabel);
  const optionValues = getOptionValues(game);
  const countdown = getCountdownText(game);
  const subSpotState = getSubSpotState(game);
  const rink = getRink(game);
  const rinkPillClasses = getRinkPillClasses(rink);
  const scheduleLabel =
    timeOnly && getTimeText(game) ? getTimeText(game) : getScheduleText(game);
  const isPlaying = game?.stage === "selected" || game?.stage === "confirmed-in" || game?.stage === "sub-requested" || selection?.attendance === "IN";
  const isSubRequestedFilled = game?.stage === "sub-requested" && subSpotState === "filled";
  const jerseyGuide = isMyGame || isPlaying ? getSubJerseyGuide(game) : null;
  const isGameToday = game?.schedule?.date === formatDateKey(new Date());

  const myGameRing =
    isMyGame && !pending ? "ring-1 ring-blue-600 ring-offset-0" : "";

  return (
    <article
      className={`rounded-xl ${
        pending
          ? "border border-amber-300 bg-amber-50/70 ring-1 ring-amber-200 shadow-lg shadow-amber-200/50"
          : isSubRequestedFilled && !isMyGame
          ? "border-2 border-sky-500 bg-sky-50/40 shadow-lg shadow-sky-200/40"
          : isPlaying && !isMyGame
          ? "border-2 border-emerald-600 bg-emerald-50/30 shadow-lg shadow-emerald-200/40"
          : isGameToday && !isMyGame
          ? "border-2 border-rose-600 bg-rose-50/30 shadow-lg shadow-rose-200/40"
          : "border border-slate-200 bg-white shadow-lg shadow-slate-300/55"
      } ${myGameRing} ${denseMode ? "p-2.5" : "p-3"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-slate-900 ${denseMode ? "text-[13px]" : "text-sm"}`}>
            {scheduleLabel}
          </p>
          <div className={`mt-0.5 flex flex-wrap items-center gap-1.5 ${denseMode ? "text-[11px]" : "text-xs"}`}>
            {rink ? (
              <span className={`rounded-full px-2 py-0.5 font-medium ${rinkPillClasses}`}>
                {rink} rink
              </span>
            ) : null}
            {countdown ? <span className="text-slate-500">{countdown}</span> : null}
          </div>
        </div>
        {statusLabel ? (
          <div className="shrink-0 max-w-[45%] flex items-start justify-end text-right">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium ring-1 text-center ${statusPill}`}
            >
              {statusLabel}
            </span>
          </div>
        ) : null}
      </div>

      <div className={`mt-2 flex flex-wrap items-center gap-2 ${denseMode ? "text-[13px]" : "text-sm"}`}>
        <p className="font-medium text-slate-800">{getGameHeadline(game)}</p>
        <LeagueSourceBadge game={game} />
      </div>

      {subSpotState === "needed" ? (
        <p className="mt-1 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
          Sub spot needed
        </p>
      ) : null}
      {subSpotState === "filled" ? (
        <p className="mt-1 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
          Sub spot filled
        </p>
      ) : null}
      {game?.source === "rosemont" && game.gameUrl ? (
        <p className="mt-1 text-xs">
          <a
            href={game.gameUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-violet-700 hover:text-violet-900 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Open on league site
          </a>
        </p>
      ) : null}
      {subSpotState === null && getGameNote(game) ? (
        <p className="mt-1 text-xs text-slate-600">{getGameNote(game)}</p>
      ) : null}

      {isPlaying && !optionValues.has("IN") && !optionValues.has("OUT") ? (
        <p className="mt-1 text-xs text-slate-600">
          If you will miss this game, email <a href="mailto:subs@twinrinks.com" className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline" onClick={(e) => e.stopPropagation()}>subs@twinrinks.com</a>.
        </p>
      ) : null}
      
      {jerseyGuide ? (
        <p className="mt-1 text-xs font-medium text-indigo-700">
          {jerseyGuide.text}
        </p>
      ) : null}

      <div className={`mt-3 flex flex-wrap items-center gap-1.5 ${denseMode ? "text-[11px]" : ""}`}>
        {optionValues.has("SUB") &&
        game?.stage !== "selected" &&
        game?.stage !== "confirmed-in" ? (
          <button
            type="button"
            onClick={onToggleSub}
            className={`rounded-lg font-medium transition ${
              denseMode ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs"
            } ${
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

        {optionValues.has("IN") ? (
          <button
            type="button"
            onClick={() => onToggleAttendance("IN")}
            className={`rounded-lg font-medium transition ${
              denseMode ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs"
            } ${
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
            onClick={() => onToggleAttendance("")}
            className={`rounded-lg font-medium transition ${
              denseMode ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs"
            } bg-slate-200 text-slate-800 hover:bg-slate-300`}
          >
            Unhide
          </button>
        ) : optionValues.has("OUT") ? (
          <button
            type="button"
            onClick={() =>
              onToggleAttendance(
                game?.stage === "sub-requested" || selection?.sub ? "" : "OUT"
              )
            }
            className={`rounded-lg font-medium transition ${
              denseMode ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs"
            } border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            {game?.stage === "sub-requested" || selection?.sub ? "Cancel Sub" : "OUT"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

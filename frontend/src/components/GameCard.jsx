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
  getSubJerseyGuide
} from "../lib/gameUtils";

export default function GameCard({
  game,
  selection,
  pending,
  denseMode,
  timeOnly,
  onToggleSub,
  onToggleAttendance
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
  const jerseyGuide = getSubJerseyGuide(game);

  return (
    <article
      className={`rounded-xl ${
        pending
          ? "border border-amber-300 bg-amber-50/70 ring-1 ring-amber-200 shadow-lg shadow-amber-200/50"
          : "border border-slate-200 bg-white shadow-lg shadow-slate-300/55"
      } ${denseMode ? "p-2.5" : "p-3"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
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
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusPill}`}
        >
          {statusLabel}
        </span>
      </div>

      <p className={`mt-2 font-medium text-slate-800 ${denseMode ? "text-[13px]" : "text-sm"}`}>
        {getGameHeadline(game)}
      </p>

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
      {subSpotState === null && getGameNote(game) ? (
        <p className="mt-1 text-xs text-slate-600">{getGameNote(game)}</p>
      ) : null}
      
      {jerseyGuide ? (
        <p className="mt-1 text-xs font-medium text-indigo-700">
          {jerseyGuide.text}
        </p>
      ) : null}

      <div className={`mt-3 flex flex-wrap items-center gap-1.5 ${denseMode ? "text-[11px]" : ""}`}>
        {optionValues.has("SUB") ? (
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
            {selection?.sub ? "Sub selected" : "I can sub"}
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

        {optionValues.has("OUT") ? (
          <button
            type="button"
            onClick={() => onToggleAttendance("OUT")}
            className={`rounded-lg font-medium transition ${
              denseMode ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs"
            } ${
              selection?.attendance === "OUT"
                ? "bg-amber-600 text-white hover:bg-amber-700"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            OUT
          </button>
        ) : null}

      </div>
    </article>
  );
}

function getRinkPillClasses(rink) {
  if (rink === "RED") {
    return "bg-rose-100 text-rose-800";
  }
  if (rink === "BLUE") {
    return "bg-sky-100 text-sky-800";
  }
  return "bg-slate-100 text-slate-600";
}

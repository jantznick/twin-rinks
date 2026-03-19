import {
  buildUpcomingWeekBuckets,
  getLeagueLabel,
  getTimeText
} from "../lib/gameUtils";

export default function GamesWeekBoard({ games, onSelectGame }) {
  const buckets = buildUpcomingWeekBuckets(games, 14);
  const firstWeek = buckets.slice(0, 7);
  const secondWeek = buckets.slice(7, 14);
  const firstRangeLabel = getRangeLabel(firstWeek);
  const secondRangeLabel = getRangeLabel(secondWeek);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {firstRangeLabel}
        </p>
        <div className="grid min-w-[980px] grid-cols-7 gap-3">
          {firstWeek.map((bucket) => (
            <WeekDayColumn key={bucket.key} bucket={bucket} onSelectGame={onSelectGame} />
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {secondRangeLabel}
        </p>
        <div className="grid min-w-[980px] grid-cols-7 gap-3">
          {secondWeek.map((bucket) => (
            <WeekDayColumn key={bucket.key} bucket={bucket} onSelectGame={onSelectGame} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekDayColumn({ bucket, onSelectGame }) {
  const isToday = isDateToday(bucket.date);

  return (
    <section
      className={`rounded-xl border p-2 ${
        isToday
          ? "border-indigo-300 bg-indigo-50/70"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-2 border-b border-slate-200 pb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          {bucket.label}
          {isToday ? (
            <span className="ml-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Today
            </span>
          ) : null}
        </h3>
      </div>

      {bucket.games.length === 0 ? (
        <p className="text-[11px] text-slate-500">No games</p>
      ) : (
        <div className="space-y-1.5">
          {bucket.games.map((game, index) => (
            <button
              key={game.gameId || `${bucket.key}-${index}`}
              type="button"
              onClick={() => onSelectGame(game)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-left hover:bg-slate-100"
            >
              <p className="text-[11px] font-medium text-slate-700">
                {getTimeText(game) || "Time TBA"}
              </p>
              <p className="text-[11px] text-slate-600">{getLeagueLabel(game)}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function isDateToday(date) {
  if (!date) {
    return false;
  }
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function getRangeLabel(weekBuckets) {
  if (!weekBuckets || weekBuckets.length === 0) {
    return "No dates";
  }
  const first = weekBuckets[0].date;
  const last = weekBuckets[weekBuckets.length - 1].date;
  return `${formatMonthDay(first)} - ${formatMonthDay(last)}`;
}

function formatMonthDay(date) {
  if (!date) {
    return "";
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

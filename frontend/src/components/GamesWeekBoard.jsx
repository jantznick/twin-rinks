import {
  buildUpcomingWeekBuckets,
  getLeagueLabel,
  getTimeText,
  getGameStartDate
} from "../lib/gameUtils";
import GameCard from "./GameCard";

export default function GamesWeekBoard({
  games,
  draftSelections,
  pendingGameIds,
  denseMode,
  isMyGamesTab,
  onToggleSub,
  onToggleAttendance,
  onSelectGame
}) {
  const buckets = buildUpcomingWeekBuckets(games, 14);
  const firstWeek = buckets.slice(0, 7);
  const secondWeek = buckets.slice(7, 14);
  const firstRangeLabel = getRangeLabel(firstWeek);
  const secondRangeLabel = getRangeLabel(secondWeek);

  const lastBucketDate = buckets[buckets.length - 1].date;
  const cutoffTime = new Date(
    lastBucketDate.getFullYear(),
    lastBucketDate.getMonth(),
    lastBucketDate.getDate(),
    23,
    59,
    59,
    999
  ).getTime();

  const overflowGames = games
    .filter((g) => {
      const d = getGameStartDate(g);
      return d && d.getTime() > cutoffTime;
    })
    .sort((a, b) => getGameStartDate(a).getTime() - getGameStartDate(b).getTime());

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {firstRangeLabel}
        </p>
        <div className="grid min-w-[980px] grid-cols-7 gap-3">
          {firstWeek.map((bucket) => (
            <WeekDayColumn key={bucket.key} bucket={bucket} draftSelections={draftSelections} onSelectGame={onSelectGame} />
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {secondRangeLabel}
        </p>
        <div className="grid min-w-[980px] grid-cols-7 gap-3">
          {secondWeek.map((bucket) => (
            <WeekDayColumn key={bucket.key} bucket={bucket} draftSelections={draftSelections} onSelectGame={onSelectGame} />
          ))}
        </div>
      </div>

      {overflowGames.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-sm font-semibold text-slate-800">
            There {overflowGames.length === 1 ? "is" : "are"} {overflowGames.length} game{overflowGames.length === 1 ? "" : "s"} over 2 weeks away
          </p>
          <div className={`grid grid-cols-1 ${denseMode ? "gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "gap-3 sm:grid-cols-2 xl:grid-cols-3"}`}>
            {overflowGames.map((game, index) => (
              <GameCard
                key={game.gameId || `overflow-${index}`}
                game={game}
                selection={draftSelections[game.gameId] || {}}
                pending={pendingGameIds?.has(game.gameId)}
                denseMode={denseMode}
                isMyGamesTab={isMyGamesTab}
                onToggleSub={() => onToggleSub(game.gameId)}
                onToggleAttendance={(value) => onToggleAttendance(game.gameId, value)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WeekDayColumn({ bucket, draftSelections, onSelectGame }) {
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
          {bucket.games.map((game, index) => {
            const selection = draftSelections?.[game.gameId];
            const isPlaying = game?.stage === "selected" || game?.stage === "confirmed-in" || selection?.attendance === "IN";
            return (
              <button
                key={game.gameId || `${bucket.key}-${index}`}
                type="button"
                onClick={() => onSelectGame(game)}
                className={`w-full rounded-lg border px-2 py-1.5 text-left hover:bg-slate-100 ${
                  isPlaying
                    ? "border-emerald-500 bg-emerald-50/50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="text-[11px] font-medium text-slate-700">
                  {getTimeText(game) || "Time TBA"}
                </p>
                <p className="text-[11px] text-slate-600">{getLeagueLabel(game)}</p>
              </button>
            );
          })}
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

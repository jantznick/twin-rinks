import { useEffect, useMemo, useState } from "react";
import AppShellHeader from "../components/AppShellHeader";
import seasonCalendar from "../data/seasonCalendar.json";

const RAW_GAMES = Array.isArray(seasonCalendar)
  ? seasonCalendar
  : seasonCalendar.games || [];
const RAW_OTHER_DATES = Array.isArray(seasonCalendar.otherDates)
  ? seasonCalendar.otherDates
  : [];
const GAMES = RAW_GAMES.map((entry, index) => normalizeSeasonGame(entry, index)).filter(
  Boolean
);
const OTHER_DATES = RAW_OTHER_DATES
  .map((entry, index) => normalizeOtherDate(entry, index))
  .filter(Boolean);

const LEAGUE_OPTIONS = [...new Set(GAMES.map((game) => game.league))].sort();
const TEAM_OPTIONS = [
  ...new Set(GAMES.flatMap((game) => [game.home, game.away]).filter(Boolean))
].sort();

export default function SchedulePage() {
  const [selectedLeagues, setSelectedLeagues] = useState(
    () => new Set(LEAGUE_OPTIONS)
  );
  const [selectedTeams, setSelectedTeams] = useState(() => new Set(TEAM_OPTIONS));
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [selectedDay, setSelectedDay] = useState(1);
  const [dayModalOpen, setDayModalOpen] = useState(false);

  const filteredGames = useMemo(
    () =>
      GAMES.filter(
        (game) =>
          selectedLeagues.has(game.league) &&
          (selectedTeams.has(game.home) || selectedTeams.has(game.away))
      ),
    [selectedLeagues, selectedTeams]
  );

  const monthKeys = useMemo(
    () =>
      [...new Set(filteredGames.map((game) => game.monthKey))].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      ),
    [filteredGames]
  );

  useEffect(() => {
    if (monthKeys.length === 0) {
      setSelectedMonthKey("");
      return;
    }
    if (!selectedMonthKey || !monthKeys.includes(selectedMonthKey)) {
      const currentMonthKey = monthKeyFromDate(new Date());
      setSelectedMonthKey(
        monthKeys.includes(currentMonthKey) ? currentMonthKey : monthKeys[0]
      );
    }
  }, [monthKeys, selectedMonthKey]);

  const monthGames = useMemo(
    () => filteredGames.filter((game) => game.monthKey === selectedMonthKey),
    [filteredGames, selectedMonthKey]
  );

  const dayMap = useMemo(() => {
    const result = new Map();
    for (const game of monthGames) {
      if (!result.has(game.dayOfMonth)) {
        result.set(game.dayOfMonth, []);
      }
      result.get(game.dayOfMonth).push(game);
    }
    for (const games of result.values()) {
      games.sort((a, b) => a.timestamp - b.timestamp);
    }
    return result;
  }, [monthGames]);

  const monthDate = useMemo(() => parseMonthKey(selectedMonthKey), [selectedMonthKey]);
  const monthLabel = useMemo(() => {
    if (!monthDate) {
      return "No month selected";
    }
    return monthDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  }, [monthDate]);

  const daysInMonth = monthDate ? getDaysInMonth(monthDate) : 0;
  const firstWeekday = monthDate ? startOfMonth(monthDate).getDay() : 0;
  const dayCells = useMemo(() => {
    const cells = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(day);
    }
    return cells;
  }, [firstWeekday, daysInMonth]);

  useEffect(() => {
    if (!monthDate) {
      setSelectedDay(1);
      return;
    }
    if (selectedDay > daysInMonth) {
      setSelectedDay(1);
      return;
    }
    if (!dayMap.has(selectedDay)) {
      const firstWithGames = [...dayMap.keys()].sort((a, b) => a - b)[0] || 1;
      setSelectedDay(firstWithGames);
    }
  }, [selectedDay, monthDate, dayMap, daysInMonth]);

  const selectedDayGames = dayMap.get(selectedDay) || [];
  const selectedDayEvents = useMemo(
    () =>
      OTHER_DATES.filter(
        (event) =>
          event.monthKey === selectedMonthKey &&
          event.dayOfMonth === selectedDay &&
          (event.league ? selectedLeagues.has(event.league) : true)
      ),
    [selectedMonthKey, selectedDay, selectedLeagues]
  );
  const selectedMonthIndex = monthKeys.findIndex((value) => value === selectedMonthKey);

  const goMonth = (direction) => {
    if (selectedMonthIndex < 0) {
      return;
    }
    const nextIndex = selectedMonthIndex + direction;
    if (nextIndex < 0 || nextIndex >= monthKeys.length) {
      return;
    }
    setSelectedMonthKey(monthKeys[nextIndex]);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-4 text-slate-900 md:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <AppShellHeader
          title="Season Schedule"
          subtitle="Full season calendar with multi-select league and team filters."
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/40">
          <div className="grid gap-3 md:grid-cols-2">
            <FilterDropdown
              label="Leagues"
              options={LEAGUE_OPTIONS}
              selected={selectedLeagues}
              onToggle={(value) =>
                setSelectedLeagues((previous) => toggleSetValue(previous, value))
              }
              onSelectAll={() => setSelectedLeagues(new Set(LEAGUE_OPTIONS))}
              onClear={() => setSelectedLeagues(new Set())}
            />
            <FilterDropdown
              label="Teams"
              options={TEAM_OPTIONS}
              selected={selectedTeams}
              onToggle={(value) =>
                setSelectedTeams((previous) => toggleSetValue(previous, value))
              }
              onSelectAll={() => setSelectedTeams(new Set(TEAM_OPTIONS))}
              onClear={() => setSelectedTeams(new Set())}
            />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                disabled={selectedMonthIndex <= 0}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <p className="text-sm font-semibold text-slate-800">{monthLabel}</p>
              <button
                type="button"
                onClick={() => goMonth(1)}
                disabled={
                  selectedMonthIndex < 0 || selectedMonthIndex >= monthKeys.length - 1
                }
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>

            {selectedMonthKey ? (
              <div className="mt-4">
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-1.5">
                  {dayCells.map((day, index) =>
                    day === null ? (
                      <div key={`blank-${index}`} className="h-20 rounded-lg bg-white/80" />
                    ) : (
                      <button
                        key={`day-${day}`}
                        type="button"
                        onClick={() => {
                          setSelectedDay(day);
                          setDayModalOpen(true);
                        }}
                        className={`h-20 rounded-lg border p-1 text-left transition ${
                          selectedDay === day
                            ? "border-indigo-400 bg-indigo-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <span className="text-xs font-semibold text-slate-800">{day}</span>
                          <span className="text-[11px] text-slate-500">
                            {(dayMap.get(day)?.length || 0) +
                              countEventsForDay(
                                OTHER_DATES,
                                selectedMonthKey,
                                day,
                                selectedLeagues
                              )}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[11px] text-slate-500">
                          {renderDayPreview(dayMap.get(day) || [])}
                        </p>
                      </button>
                    )
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                No games match current filters.
              </p>
            )}
          </div>
        </section>
      </div>

      <ScheduleDayModal
        open={dayModalOpen}
        title={formatSelectedDayHeading(monthDate, selectedDay)}
        games={selectedDayGames}
        events={selectedDayEvents}
        onClose={() => setDayModalOpen(false)}
      />
    </main>
  );
}

function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onSelectAll,
  onClear
}) {
  return (
    <details className="group relative">
      <summary className="list-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">
            {label}: {selected.size}/{options.length}
          </span>
          <span className="text-xs text-slate-500 group-open:rotate-180 transition">▾</span>
        </div>
      </summary>
      <div className="absolute z-20 mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 shadow-lg">
        <div className="mb-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-[11px] font-medium text-indigo-700 hover:text-indigo-900"
          >
            All
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
          >
            None
          </button>
        </div>
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.has(option)}
                onChange={() => onToggle(option)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function ScheduleDayModal({ open, title, games, events, onClose }) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-3 space-y-2 overflow-y-auto">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
            >
              <p className="font-medium text-amber-900">{event.title}</p>
              <p className="text-xs text-amber-700">
                {event.league ? `League: ${event.league}` : "League-wide"}
              </p>
            </div>
          ))}

          {games.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              No games for this day.
            </p>
          ) : (
            games.map((game) => (
              <div
                key={game.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <p className="font-medium text-slate-800">
                  {game.time} - {game.league}
                </p>
                <p className="text-xs text-slate-600">
                  {game.home} vs {game.away} - {game.rink} rink
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function toggleSetValue(previousSet, value) {
  const next = new Set(previousSet);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function renderDayPreview(dayGames) {
  if (dayGames.length === 0) {
    return "No games";
  }
  const top = dayGames[0];
  if (dayGames.length === 1) {
    return `${top.league}: ${top.home} vs ${top.away}`;
  }
  return `${top.league}: ${top.home} vs ${top.away} +${dayGames.length - 1} more`;
}

function normalizeSeasonGame(entry, index) {
  const date = String(entry?.date || "").trim();
  const time = String(entry?.time || "").trim();
  const league = String(entry?.league || "").trim();
  const home = String(entry?.home || "").trim();
  const away = String(entry?.away || "").trim();
  if (!date || !time || !league || !home) {
    return null;
  }
  const parsed = parseSeasonDateTime(date, time);
  if (!parsed) {
    return null;
  }
  return {
    id: String(entry?.id || `season-${index + 1}`),
    date,
    day: String(entry?.day || "").trim(),
    rink: String(entry?.rink || "").trim() || "Unknown",
    time,
    league,
    home,
    away,
    timestamp: parsed.getTime(),
    dayOfMonth: parsed.getDate(),
    monthKey: monthKeyFromDate(parsed)
  };
}

function normalizeOtherDate(entry, index) {
  const date = String(entry?.date || "").trim();
  const title = String(entry?.title || "").trim();
  if (!date || !title) {
    return null;
  }
  const parsed = parseSeasonDateTime(date, "12:00 AM");
  if (!parsed) {
    return null;
  }
  return {
    id: String(entry?.id || `event-${index + 1}`),
    date,
    title,
    league: String(entry?.league || "").trim(),
    dayOfMonth: parsed.getDate(),
    monthKey: monthKeyFromDate(parsed)
  };
}

function parseSeasonDateTime(dateText, timeText) {
  const dateMatch =
    String(dateText).match(/^(\d{4})-(\d{2})-(\d{2})$/) ||
    String(dateText).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const normalizedTime = String(timeText)
    .trim()
    .replace(/^(\d{1,2}):(\d{2})([AP])$/i, "$1:$2 $3M");
  const timeMatch = normalizedTime.match(/^(\d{1,2}):(\d{2})\s*([AP])M$/i);
  if (!dateMatch || !timeMatch) {
    return null;
  }
  const iso = String(dateText).includes("-");
  const year = iso ? Number(dateMatch[1]) : Number(dateMatch[3]);
  const month = iso ? Number(dateMatch[2]) - 1 : Number(dateMatch[1]) - 1;
  const day = iso ? Number(dateMatch[3]) : Number(dateMatch[2]);
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = timeMatch[3].toUpperCase();
  if (meridiem === "A" && hour === 12) {
    hour = 0;
  } else if (meridiem === "P" && hour < 12) {
    hour += 12;
  }
  const parsed = new Date(year, month, day, hour, minute, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function countEventsForDay(events, monthKey, dayOfMonth, selectedLeagues) {
  return events.filter(
    (event) =>
      event.monthKey === monthKey &&
      event.dayOfMonth === dayOfMonth &&
      (event.league ? selectedLeagues.has(event.league) : true)
  ).length;
}

function monthKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function parseMonthKey(monthKey) {
  if (!monthKey) {
    return null;
  }
  const date = new Date(`${monthKey}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function getDaysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatSelectedDayHeading(monthDate, selectedDay) {
  if (!monthDate || !selectedDay) {
    return "Selected day";
  }
  const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), selectedDay, 0, 0, 0, 0);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

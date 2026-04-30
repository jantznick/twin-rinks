import seasonCalendar from "../data/seasonCalendar.json";
import { getGameStartDate, getRink } from "./gameUtils";

const RAW_GAMES = Array.isArray(seasonCalendar)
  ? seasonCalendar
  : seasonCalendar.games || [];

/**
 * Playoff / placement rows: same label for home and away, league-wide (not `otherDates`).
 */
export function isSeasonCalendarPlaceholderRow(row) {
  const h = String(row?.home || "").trim();
  const a = String(row?.away || "").trim();
  if (!h || h !== a) {
    return false;
  }
  const u = h.toUpperCase();
  if (/\b(SEMI|PLAYOFF|FINAL|CHAMP|QUARTER|ROUND)\b/i.test(u)) {
    return true;
  }
  return false;
}

export function buildSeasonCalendarLeagueTeamOptions() {
  const leagues = [
    ...new Set(RAW_GAMES.map((g) => String(g.league || "").trim()).filter(Boolean))
  ].sort((x, y) => x.localeCompare(y));

  const teamsByLeague = {};
  for (const lg of leagues) {
    teamsByLeague[lg] = new Set();
  }
  for (const row of RAW_GAMES) {
    const league = String(row.league || "").trim();
    if (!league || !teamsByLeague[league]) {
      continue;
    }
    if (isSeasonCalendarPlaceholderRow(row)) {
      continue;
    }
    const h = String(row.home || "").trim();
    const a = String(row.away || "").trim();
    if (h) {
      teamsByLeague[league].add(h);
    }
    if (a) {
      teamsByLeague[league].add(a);
    }
  }
  const out = {};
  for (const lg of leagues) {
    out[lg] = [...teamsByLeague[lg]].sort((x, y) => x.localeCompare(y));
  }
  return { leagues, teamsByLeague: out };
}

function startOfLocalDay(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0);
}

function parseSeasonRowDateTime(row) {
  const dateText = String(row?.date || "").trim();
  const timeText = String(row?.time || "").trim();
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

function formatLegacyDateFromDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function formatLegacyTimeFromDate(d) {
  let hours = d.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours %= 12;
  hours = hours === 0 ? 12 : hours;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${mm} ${ampm}`;
}

/**
 * Legacy subs HTML often uses "blue rink"; season JSON uses "Blue". Align for dedupe keys.
 */
function normalizeRinkForDedupe(rinkRaw) {
  let s = String(rinkRaw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  s = s.replace(/\s+rink$/i, "").trim();
  return s;
}

function dedupeKeyFromParsedDate(parsed, rinkRaw) {
  if (!parsed) {
    return null;
  }
  const y = parsed.getFullYear();
  const mo = String(parsed.getMonth() + 1).padStart(2, "0");
  const da = String(parsed.getDate()).padStart(2, "0");
  const d = `${y}-${mo}-${da}`;
  const r = normalizeRinkForDedupe(rinkRaw);
  const mins = parsed.getHours() * 60 + parsed.getMinutes();
  return `${d}|${r}|${mins}`;
}

function legacyTwinRinksDedupeKeys(existingGames) {
  const keys = new Set();
  for (const g of existingGames || []) {
    if (g?.source !== "twin-rinks-league") {
      continue;
    }
    const p = getGameStartDate(g);
    if (!p) {
      continue;
    }
    const k = dedupeKeyFromParsedDate(p, getRink(g));
    if (k) {
      keys.add(k);
    }
  }
  return keys;
}

function rowMatchesSeasonSelection(row, league, team) {
  const lg = String(row.league || "").trim();
  if (lg !== league) {
    return false;
  }
  if (isSeasonCalendarPlaceholderRow(row)) {
    return true;
  }
  const h = String(row.home || "").trim();
  const a = String(row.away || "").trim();
  return h === team || a === team;
}

function seasonRowToGame(row, rosterTeam) {
  const parsed = parseSeasonRowDateTime(row);
  if (!parsed) {
    return null;
  }
  const isPh = isSeasonCalendarPlaceholderRow(row);
  const home = String(row.home || "").trim();
  const away = String(row.away || "").trim();
  const summary = isPh ? `${String(row.league || "").trim()} — ${home}` : `${home} vs ${away}`;
  const dateStr = formatLegacyDateFromDate(parsed);
  const dayShort = parsed.toLocaleDateString(undefined, { weekday: "short" });
  const timeStr = formatLegacyTimeFromDate(parsed);
  const rink = String(row.rink || "").trim() || "Unknown";
  const dateTimeRink = `${dateStr} ${dayShort} ${timeStr} ${rink}`;

  return {
    gameId: `tr-season-${row.id}`,
    source: "twin-rinks-season",
    stage: "external-league",
    seasonCalendarLeague: String(row.league || "").trim(),
    seasonRosterTeam: rosterTeam,
    dateTimeRink,
    schedule: {
      raw: dateTimeRink,
      date: dateStr,
      day: dayShort,
      time: timeStr,
      rink
    },
    details: {
      kind: "text",
      summary
    },
    infoText: "",
    options: [],
    selected: "",
    calendarRowId: row.id
  };
}

/**
 * Games from bundled season JSON for the dashboard: roster matchups + league-only playoff placeholders.
 * Drops rows that duplicate a `twin-rinks-league` game from the legacy subs page (same local date, rink, time).
 */
export function twinRinksSeasonGamesForDashboard(league, team, existingGames) {
  const lg = String(league || "").trim();
  const tm = String(team || "").trim();
  if (!lg || !tm) {
    return [];
  }

  const dedupe = legacyTwinRinksDedupeKeys(existingGames);
  const out = [];
  const todayStart = startOfLocalDay(new Date());

  for (const row of RAW_GAMES) {
    if (!rowMatchesSeasonSelection(row, lg, tm)) {
      continue;
    }
    const p = parseSeasonRowDateTime(row);
    if (!p || p.getTime() < todayStart.getTime()) {
      continue;
    }
    const game = seasonRowToGame(row, tm);
    if (!game) {
      continue;
    }
    const k = dedupeKeyFromParsedDate(p, row.rink);
    if (k && dedupe.has(k)) {
      continue;
    }
    out.push(game);
  }

  return out;
}

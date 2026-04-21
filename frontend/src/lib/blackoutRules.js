import { getDateKeyIsoLocal } from "./gameUtils";
import { isScheduleId } from "./sportsengineCalendars";

export const TWIN_RINKS_SCOPE = "twin-rinks";

export const RECURRENCE = {
  ONE_OFF: "ONE_OFF",
  WEEKLY: "WEEKLY",
  MONTHLY_NTH: "MONTHLY_NTH"
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

function formatMonthlyOccurrenceHuman(monthOrdinal, weekday) {
  const wd = WEEKDAYS_LONG[Number(weekday)] || "day";
  const o = Number(monthOrdinal);
  if (o === 5) {
    return `Last ${wd} of each month`;
  }
  const lead = ["", "First", "Second", "Third", "Fourth"][o] || "";
  return `${lead} ${wd} of each month`;
}

function parseIsoLocalDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) {
    return null;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, 12, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }
  return dt;
}

function matchesMonthlyNth(gameDate, weekday, monthOrdinal) {
  const y = gameDate.getFullYear();
  const m = gameDate.getMonth();
  if (gameDate.getDay() !== weekday) {
    return false;
  }
  const dom = gameDate.getDate();
  const dates = [];
  const last = new Date(y, m + 1, 0).getDate();
  for (let day = 1; day <= last; day += 1) {
    const dt = new Date(y, m, day, 12, 0, 0, 0);
    if (dt.getDay() === weekday) {
      dates.push(day);
    }
  }
  if (monthOrdinal === 5) {
    return dom === dates[dates.length - 1];
  }
  return dates[monthOrdinal - 1] === dom;
}

/**
 * Twin Rinks subs + league rows use `twin-rinks`; SportsEngine uses saved schedule UUID.
 */
export function getGameLeagueScope(game) {
  if (game?.source === "sportsengine") {
    const sid = String(game?.scheduleId || "").trim();
    if (isScheduleId(sid)) {
      return sid;
    }
  }
  return TWIN_RINKS_SCOPE;
}

function ruleAppliesToLeague(rule, gameScope) {
  const scopes = Array.isArray(rule?.leagueScopes) ? rule.leagueScopes : [];
  if (scopes.length === 0) {
    return true;
  }
  return scopes.includes(gameScope);
}

function matchesRecurrence(rule, gameDate) {
  const kind = String(rule?.recurrenceKind || "");
  if (kind === RECURRENCE.ONE_OFF) {
    const target = String(rule.oneOffDate || "").trim();
    const y = gameDate.getFullYear();
    const m = String(gameDate.getMonth() + 1).padStart(2, "0");
    const d = String(gameDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}` === target;
  }
  if (kind === RECURRENCE.WEEKLY) {
    return gameDate.getDay() === Number(rule.weekday);
  }
  if (kind === RECURRENCE.MONTHLY_NTH) {
    return matchesMonthlyNth(gameDate, Number(rule.weekday), Number(rule.monthOrdinal));
  }
  return false;
}

export function getMatchingBlackoutRules(game, rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return [];
  }
  const iso = getDateKeyIsoLocal(game);
  if (!iso) {
    return [];
  }
  const gameDate = parseIsoLocalDate(iso);
  if (!gameDate) {
    return [];
  }
  const scope = getGameLeagueScope(game);
  const out = [];
  for (const rule of rules) {
    if (!ruleAppliesToLeague(rule, scope)) {
      continue;
    }
    if (matchesRecurrence(rule, gameDate)) {
      out.push(rule);
    }
  }
  return out;
}

function scopeSummary(rule, resolveLeagueLabel) {
  const scopes = Array.isArray(rule?.leagueScopes) ? rule.leagueScopes : [];
  if (scopes.length === 0) {
    return "All leagues";
  }
  return scopes
    .map((s) => (s === TWIN_RINKS_SCOPE ? "Twin Rinks" : resolveLeagueLabel(s)))
    .join(", ");
}

function recurrenceSummary(rule) {
  const kind = String(rule?.recurrenceKind || "");
  if (kind === RECURRENCE.ONE_OFF) {
    return `One-time · ${rule.oneOffDate || ""}`;
  }
  if (kind === RECURRENCE.WEEKLY) {
    const wd = WEEKDAYS[Number(rule.weekday)] || "?";
    return `Weekly · ${wd}`;
  }
  if (kind === RECURRENCE.MONTHLY_NTH) {
    return formatMonthlyOccurrenceHuman(rule.monthOrdinal, rule.weekday);
  }
  return "Rule";
}

/**
 * Matched rules as { line, note? } for modals and tooltips.
 */
export function getBlackoutReasonEntries(game, rules, resolveLeagueLabel) {
  const matched = getMatchingBlackoutRules(game, rules);
  const resolver =
    typeof resolveLeagueLabel === "function"
      ? resolveLeagueLabel
      : (id) => String(id || "");
  return matched.map((rule) => {
    const line = `${scopeSummary(rule, resolver)} — ${recurrenceSummary(rule)}`;
    const note = String(rule.note || "").trim();
    return note ? { line, note } : { line };
  });
}

/**
 * Flat lines for compact display (e.g. card tooltip): rule line, optional "Note: …" on next line.
 */
export function getBlackoutReasonLines(game, rules, resolveLeagueLabel) {
  return getBlackoutReasonEntries(game, rules, resolveLeagueLabel).flatMap((e) =>
    e.note ? [e.line, `Note: ${e.note}`] : [e.line]
  );
}

export function isGameBlackout(game, rules) {
  return getMatchingBlackoutRules(game, rules).length > 0;
}

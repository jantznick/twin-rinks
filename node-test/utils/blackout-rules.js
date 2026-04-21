"use strict";

const { isUuid } = require("./sportsengine-calendars-storage");

const TWIN_RINKS_SCOPE = "twin-rinks";

const RECURRENCE = {
  ONE_OFF: "ONE_OFF",
  WEEKLY: "WEEKLY",
  MONTHLY_NTH: "MONTHLY_NTH"
};

const MAX_RULES = 200;
const MAX_NOTE_LEN = 500;

function sanitizeOptionalNote(raw) {
  const s = String(raw ?? "").trim();
  if (!s) {
    return null;
  }
  return s.length > MAX_NOTE_LEN ? s.slice(0, MAX_NOTE_LEN) : s;
}

function parseYmdToUtcDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!m) {
    return null;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

function dateToYmd(d) {
  if (!d) {
    return null;
  }
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) {
    return null;
  }
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, "0");
  const day = String(x.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param {unknown} rawScopes
 * @param {Set<string>} allowedScheduleIds
 * @returns {string[]}
 */
function sanitizeLeagueScopes(rawScopes, allowedScheduleIds) {
  if (!Array.isArray(rawScopes)) {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const item of rawScopes) {
    const s = String(item ?? "").trim();
    if (!s || seen.has(s)) {
      continue;
    }
    if (s === TWIN_RINKS_SCOPE) {
      seen.add(s);
      out.push(s);
      continue;
    }
    if (isUuid(s) && allowedScheduleIds.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * @param {unknown} raw
 * @param {Set<string>} allowedScheduleIds
 * @returns {object|null}
 */
function sanitizeOneRule(raw, allowedScheduleIds) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const kind = String(raw.recurrenceKind || "").trim().toUpperCase();
  if (
    kind !== RECURRENCE.ONE_OFF &&
    kind !== RECURRENCE.WEEKLY &&
    kind !== RECURRENCE.MONTHLY_NTH
  ) {
    return null;
  }

  const leagueScopes = sanitizeLeagueScopes(raw.leagueScopes, allowedScheduleIds);
  const note = sanitizeOptionalNote(raw.note);

  if (kind === RECURRENCE.ONE_OFF) {
    const oneOff = parseYmdToUtcDate(raw.oneOffDate);
    if (!oneOff) {
      return null;
    }
    return {
      recurrenceKind: RECURRENCE.ONE_OFF,
      oneOffDate: oneOff,
      weekday: null,
      monthOrdinal: null,
      leagueScopes,
      note
    };
  }

  if (kind === RECURRENCE.WEEKLY) {
    const wd = Number(raw.weekday);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) {
      return null;
    }
    return {
      recurrenceKind: RECURRENCE.WEEKLY,
      oneOffDate: null,
      weekday: wd,
      monthOrdinal: null,
      leagueScopes,
      note
    };
  }

  const wd = Number(raw.weekday);
  const ord = Number(raw.monthOrdinal);
  if (!Number.isInteger(wd) || wd < 0 || wd > 6) {
    return null;
  }
  if (!Number.isInteger(ord) || ord < 1 || ord > 5) {
    return null;
  }
  return {
    recurrenceKind: RECURRENCE.MONTHLY_NTH,
    oneOffDate: null,
    weekday: wd,
    monthOrdinal: ord,
    leagueScopes,
    note
  };
}

/**
 * @param {unknown} rawList
 * @param {Array<{ scheduleId?: string }>} sportsengineCalendars
 * @returns {{ rules: Array<{ recurrenceKind: string, oneOffDate: Date|null, weekday: number|null, monthOrdinal: number|null, leagueScopes: string[] }> }}
 */
function sanitizeBlackoutRulesList(rawList, sportsengineCalendars) {
  const cals = Array.isArray(sportsengineCalendars) ? sportsengineCalendars : [];
  const allowedScheduleIds = new Set();
  for (const c of cals) {
    const sid = String(c?.scheduleId ?? "").trim();
    if (isUuid(sid)) {
      allowedScheduleIds.add(sid);
    }
  }

  if (!Array.isArray(rawList)) {
    return { rules: [] };
  }
  const rules = [];
  for (const raw of rawList) {
    if (rules.length >= MAX_RULES) {
      break;
    }
    const one = sanitizeOneRule(raw, allowedScheduleIds);
    if (one) {
      rules.push(one);
    }
  }
  return { rules };
}

function formatRuleForClient(rule) {
  const scopes = rule.leagueScopes;
  const leagueScopes = Array.isArray(scopes) ? scopes : [];
  const base = {
    id: rule.id,
    recurrenceKind: rule.recurrenceKind,
    leagueScopes,
    note: rule.note ? String(rule.note) : null,
    createdAt: rule.createdAt?.toISOString?.() || null,
    updatedAt: rule.updatedAt?.toISOString?.() || null
  };
  if (rule.recurrenceKind === RECURRENCE.ONE_OFF) {
    return {
      ...base,
      oneOffDate: dateToYmd(rule.oneOffDate),
      weekday: null,
      monthOrdinal: null
    };
  }
  if (rule.recurrenceKind === RECURRENCE.WEEKLY) {
    return {
      ...base,
      oneOffDate: null,
      weekday: rule.weekday,
      monthOrdinal: null
    };
  }
  return {
    ...base,
    oneOffDate: null,
    weekday: rule.weekday,
    monthOrdinal: rule.monthOrdinal
  };
}

module.exports = {
  TWIN_RINKS_SCOPE,
  RECURRENCE,
  MAX_RULES,
  sanitizeBlackoutRulesList,
  formatRuleForClient,
  parseYmdToUtcDate,
  dateToYmd
};

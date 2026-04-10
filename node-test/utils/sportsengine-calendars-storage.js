"use strict";

const crypto = require("crypto");
const {
  isValidSportsengineTeamScheduleUrl,
  normalizePastedScheduleUrl
} = require("./sportsengine-schedule-url");

const MAX_LABEL = 120;

/** UUID v4 (matches `crypto.randomUUID()` in Node and modern browsers). */
function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s ?? "").trim()
  );
}

/**
 * Each entry: { scheduleId, url, leagueLabel }.
 * URL must match SportsEngine team schedule format (validated once here).
 */
function sanitizeSportsengineCalendars(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  const seenUrl = new Set();
  const seenId = new Set();

  for (const item of raw) {
    let url = "";
    let leagueLabel = "";
    let scheduleId = "";

    if (typeof item === "string") {
      url = normalizePastedScheduleUrl(String(item).trim());
      leagueLabel = "League schedule";
    } else if (item && typeof item === "object") {
      url = normalizePastedScheduleUrl(String(item.url ?? "").trim());
      leagueLabel = String(item.leagueLabel ?? "").trim().slice(0, MAX_LABEL);
      const sid = String(item.scheduleId ?? "").trim();
      scheduleId = isUuid(sid) ? sid : "";
    }

    if (!url || !isValidSportsengineTeamScheduleUrl(url) || seenUrl.has(url)) {
      continue;
    }
    if (!scheduleId) {
      scheduleId = crypto.randomUUID();
    }
    while (seenId.has(scheduleId)) {
      scheduleId = crypto.randomUUID();
    }
    seenUrl.add(url);
    seenId.add(scheduleId);

    if (!leagueLabel) {
      leagueLabel = "League schedule";
    }
    out.push({ scheduleId, url, leagueLabel });
  }
  return out;
}

/**
 * Ensures every entry has a scheduleId (legacy rows). Strips teamDisplayName.
 * @returns {{ calendars: Array, changed: boolean }}
 */
function backfillScheduleIds(calendars) {
  const list = Array.isArray(calendars) ? calendars : [];
  let changed = false;
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== "object") {
      continue;
    }
    const copy = { ...c };
    if (copy.teamDisplayName !== undefined) {
      delete copy.teamDisplayName;
      changed = true;
    }
    if (!copy.scheduleId || !isUuid(String(copy.scheduleId))) {
      copy.scheduleId = crypto.randomUUID();
      changed = true;
    }
    const url = normalizePastedScheduleUrl(String(copy.url ?? "").trim());
    if (!url) {
      continue;
    }
    copy.url = url;
    out.push(copy);
  }
  return { calendars: out, changed };
}

module.exports = {
  sanitizeSportsengineCalendars,
  backfillScheduleIds,
  isUuid
};

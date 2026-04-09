"use strict";

const { DEFAULT_SPORTSENGINE_TEAM_SCHEDULE_URL } = require("../config");

/** Matches SportsEngine / Sports NGIN public team schedule pages. */
const TEAM_INSTANCE_PATH_RE = /^\/schedule\/team_instance\/(\d+)\/?$/;

function normalizePastedScheduleUrl(raw) {
  let s = String(raw ?? "").trim();
  if (!s) {
    return "";
  }
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  return s;
}

function isBlockedSsrFHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) {
    return true;
  }
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) {
    return true;
  }
  if (h === "[::1]" || h === "::1") {
    return true;
  }
  if (h === "0.0.0.0") {
    return true;
  }

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) {
      return true;
    }
    if (a === 127) {
      return true;
    }
    if (a === 0) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
  }

  return false;
}

function isValidSportsengineTeamScheduleUrl(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return false;
  }
  if (isBlockedSsrFHostname(u.hostname)) {
    return false;
  }
  const path = u.pathname || "";
  if (!TEAM_INSTANCE_PATH_RE.test(path)) {
    return false;
  }
  const sub = u.searchParams.get("subseason");
  if (sub == null || sub === "" || !/^\d+$/.test(String(sub).trim())) {
    return false;
  }
  return true;
}

/**
 * Resolves a pasted or configured team schedule URL for server-side fetch.
 * Empty input falls back to DEFAULT_SPORTSENGINE_TEAM_SCHEDULE_URL from config.
 */
function resolveSportsengineTeamScheduleFetchUrl(rawFromQuery) {
  const trimmed =
    rawFromQuery !== undefined && rawFromQuery !== null
      ? String(rawFromQuery).trim()
      : "";
  const candidate = trimmed
    ? normalizePastedScheduleUrl(trimmed)
    : DEFAULT_SPORTSENGINE_TEAM_SCHEDULE_URL;

  if (!isValidSportsengineTeamScheduleUrl(candidate)) {
    return {
      error:
        "url must be a SportsEngine team schedule link: .../schedule/team_instance/<id>?subseason=<number> (https recommended)"
    };
  }

  const u = new URL(candidate);
  u.protocol = "https:";
  u.hash = "";
  return { url: u.toString() };
}

module.exports = {
  isValidSportsengineTeamScheduleUrl,
  resolveSportsengineTeamScheduleFetchUrl,
  normalizePastedScheduleUrl
};

"use strict";

const MAX_LABEL = 120;

function isHttpsUrlString(s) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Normalizes calendar entries: { url, leagueLabel, teamDisplayName? }.
 * Accepts legacy string[] for one release by coercing to { url, leagueLabel: "League schedule", teamDisplayName: "" }.
 */
function sanitizeSportsengineCalendars(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    let url = "";
    let leagueLabel = "";
    let teamDisplayName = "";
    if (typeof item === "string") {
      url = String(item).trim();
      leagueLabel = "League schedule";
    } else if (item && typeof item === "object") {
      url = String(item.url ?? "").trim();
      leagueLabel = String(item.leagueLabel ?? "").trim().slice(0, MAX_LABEL);
      teamDisplayName = String(item.teamDisplayName ?? "")
        .trim()
        .slice(0, MAX_LABEL);
    }
    if (!url || !isHttpsUrlString(url) || seen.has(url)) {
      continue;
    }
    seen.add(url);
    if (!leagueLabel) {
      leagueLabel = "League schedule";
    }
    out.push({ url, leagueLabel, teamDisplayName });
  }
  return out;
}

module.exports = {
  sanitizeSportsengineCalendars
};

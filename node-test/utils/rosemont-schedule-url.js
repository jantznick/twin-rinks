"use strict";

const {
  ROSEMONT_SCHEDULE_ALLOWED_HOSTS,
  ROSEMONT_TEAM_SCHEDULE_PATH,
  ROSEMONT_TEAM_SCHEDULE_SUBSEASON,
  ROSEMONT_TEAM_SCHEDULE_DEFAULT_URL
} = require("../config");

function isAllowedRosemontTeamScheduleUrl(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (!ROSEMONT_SCHEDULE_ALLOWED_HOSTS.has(host)) {
    return false;
  }
  if (u.pathname !== ROSEMONT_TEAM_SCHEDULE_PATH) {
    return false;
  }
  if (u.searchParams.get("subseason") !== ROSEMONT_TEAM_SCHEDULE_SUBSEASON) {
    return false;
  }
  return true;
}

function resolveRosemontTeamScheduleFetchUrl(rawFromQuery) {
  const trimmed =
    rawFromQuery !== undefined && rawFromQuery !== null
      ? String(rawFromQuery).trim()
      : "";
  const candidate = trimmed || ROSEMONT_TEAM_SCHEDULE_DEFAULT_URL;
  if (!isAllowedRosemontTeamScheduleUrl(candidate)) {
    return {
      error:
        "url must use hostname rosemontahl.com with path /schedule/team_instance/10537221 and subseason=961098"
    };
  }
  const u = new URL(candidate);
  u.protocol = "https:";
  return { url: u.toString() };
}

module.exports = {
  isAllowedRosemontTeamScheduleUrl,
  resolveRosemontTeamScheduleFetchUrl
};

"use strict";

require("dotenv").config();

const PORT = process.env.PORT || 3001;
const LEGACY_BASE_URL =
  process.env.LEGACY_BASE_URL || "https://hockeydomain.com/adulthockey/subs";
const LEGACY_LOGIN_PATH = process.env.LEGACY_LOGIN_PATH || "/subs_entry.php";
const LEGACY_GAMES_PATH =
  process.env.LEGACY_GAMES_PATH || "/all_player_login.php";
const LEGACY_SUBMIT_PATH =
  process.env.LEGACY_SUBMIT_PATH || "/cgi-bin/bnbform.cgi";
const LOG_PREFIX = "[legacy-middleware]";
const BODY_PREVIEW_LIMIT = Number(process.env.BODY_PREVIEW_LIMIT || 4000);
const LOG_SENSITIVE = process.env.LOG_SENSITIVE === "1";
const SITE_ACCESS_PASSWORD = process.env.SITE_ACCESS_PASSWORD || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const ROSEMONT_SCHEDULE_ALLOWED_HOSTS = new Set([
  "rosemontahl.com",
  "www.rosemontahl.com"
]);
const ROSEMONT_TEAM_SCHEDULE_PATH = "/schedule/team_instance/10537221";
const ROSEMONT_TEAM_SCHEDULE_SUBSEASON = "961098";
const ROSEMONT_TEAM_SCHEDULE_DEFAULT_URL =
  "https://www.rosemontahl.com/schedule/team_instance/10537221?subseason=961098";

module.exports = {
  PORT,
  LEGACY_BASE_URL,
  LEGACY_LOGIN_PATH,
  LEGACY_GAMES_PATH,
  LEGACY_SUBMIT_PATH,
  LOG_PREFIX,
  BODY_PREVIEW_LIMIT,
  LOG_SENSITIVE,
  SITE_ACCESS_PASSWORD,
  FRONTEND_URL,
  ROSEMONT_SCHEDULE_ALLOWED_HOSTS,
  ROSEMONT_TEAM_SCHEDULE_PATH,
  ROSEMONT_TEAM_SCHEDULE_SUBSEASON,
  ROSEMONT_TEAM_SCHEDULE_DEFAULT_URL
};

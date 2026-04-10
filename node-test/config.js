"use strict";

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

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
  FRONTEND_URL
};

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
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const APP_URL = process.env.APP_URL || FRONTEND_URL;
const SESSION_SECRET =
  process.env.SESSION_SECRET || "dev-session-secret-change-me";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || "";
const NODE_ENV = process.env.NODE_ENV || "development";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "Hockey <hockey@creativeendurancelab.com>";
const LEGACY_CREDENTIALS_KEY = process.env.LEGACY_CREDENTIALS_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL || "";

module.exports = {
  PORT,
  LEGACY_BASE_URL,
  LEGACY_LOGIN_PATH,
  LEGACY_GAMES_PATH,
  LEGACY_SUBMIT_PATH,
  LOG_PREFIX,
  BODY_PREVIEW_LIMIT,
  LOG_SENSITIVE,
  FRONTEND_URL,
  APP_URL,
  SESSION_SECRET,
  COOKIE_DOMAIN,
  NODE_ENV,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  LEGACY_CREDENTIALS_KEY,
  DATABASE_URL
};

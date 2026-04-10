"use strict";

const { LEGACY_BASE_URL, LEGACY_GAMES_PATH } = require("../config");
const {
  looksLikeAuthenticatedGamesPage,
  looksLikeLegacyLoginPage
} = require("./legacy-pages");

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Extracts the subs login email from the authenticated games HTML (e.g. "login: user@x.com").
 */
function extractLoginEmailFromGamesHtml(html) {
  const m = String(html || "").match(
    /login:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i
  );
  return m ? normalizeEmail(m[1]) : "";
}

/**
 * Verifies PHPSESSID by loading the legacy games page and returns the canonical login email from HTML.
 */
async function verifyTwinRinksSessionAndGetEmail(phpsessid) {
  if (!phpsessid) {
    return { ok: false, code: "no_session", email: "" };
  }

  const gamesUrl = new URL(LEGACY_GAMES_PATH, LEGACY_BASE_URL).toString();
  const response = await fetch(gamesUrl, {
    method: "GET",
    headers: {
      Cookie: `PHPSESSID=${phpsessid}`
    }
  });
  const html = await response.text();

  if (response.status >= 400 || looksLikeLegacyLoginPage(html)) {
    return { ok: false, code: "session_expired", email: "" };
  }
  if (!looksLikeAuthenticatedGamesPage(html)) {
    return { ok: false, code: "session_invalid", email: "" };
  }

  const email = extractLoginEmailFromGamesHtml(html);
  if (!email) {
    return { ok: false, code: "email_not_found", email: "" };
  }

  return { ok: true, code: "ok", email };
}

/**
 * Ensures the client-supplied email matches the legacy page (prevents saving settings for another user).
 */
function isEmailClaimValid(sessionEmail, claimedEmail) {
  if (!sessionEmail || !claimedEmail) {
    return false;
  }
  return normalizeEmail(sessionEmail) === normalizeEmail(claimedEmail);
}

module.exports = {
  normalizeEmail,
  extractLoginEmailFromGamesHtml,
  verifyTwinRinksSessionAndGetEmail,
  isEmailClaimValid
};

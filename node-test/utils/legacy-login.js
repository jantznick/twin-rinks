"use strict";

const {
  LEGACY_BASE_URL,
  LEGACY_GAMES_PATH,
  LOG_SENSITIVE
} = require("../config");
const { parseSubsHtml } = require("../subs-parser");
const { logInfo } = require("./logger");
const {
  headersToObject,
  buildBodyPreview,
  buildCurlCommand,
  getSetCookieHeaders
} = require("./http");
const {
  looksLikeAuthenticatedGamesPage,
  looksLikeLegacyLoginPage
} = require("./legacy-pages");
const {
  getPhpSessionId,
  buildLoginUrl,
  redactLoginUrl,
  maskSessionId
} = require("./legacy-session");

/**
 * Log into legacy Twin Rinks with username/password and return PHPSESSID if authenticated.
 */
async function loginToLegacy(username, password) {
  const loginUrl = buildLoginUrl(username, password);
  const safeLoginUrl = redactLoginUrl(loginUrl);
  const loginCurl = buildCurlCommand({
    method: "GET",
    url: safeLoginUrl
  });
  logInfo("Attempting legacy login", { username });
  logInfo("Legacy login request target", {
    url: safeLoginUrl,
    command: loginCurl
  });

  const response = await fetch(loginUrl, {
    method: "GET",
    redirect: "manual"
  });

  const setCookieHeaders = getSetCookieHeaders(response.headers);
  const locationHeader = response.headers.get("location");
  const responseHeaders = headersToObject(response.headers);
  const responseBody = await response.text();
  const bodyPreview = buildBodyPreview(responseBody);

  logInfo("Legacy login response received", {
    status: response.status,
    location: locationHeader,
    setCookieCount: setCookieHeaders.length,
    headers: responseHeaders,
    setCookieHeaders: LOG_SENSITIVE ? setCookieHeaders : undefined,
    bodyPreview
  });

  if (response.status >= 400) {
    return {
      ok: false,
      error: `Legacy login request failed with status ${response.status}`
    };
  }

  const phpsessid = getPhpSessionId(setCookieHeaders);
  if (!phpsessid) {
    return {
      ok: false,
      error: "Login failed: no PHPSESSID returned"
    };
  }

  const gamesUrl = new URL(LEGACY_GAMES_PATH, LEGACY_BASE_URL).toString();
  const verifyResponse = await fetch(gamesUrl, {
    method: "GET",
    headers: { Cookie: `PHPSESSID=${phpsessid}` }
  });
  const verifyHtml = await verifyResponse.text();
  const verifyParsed = parseSubsHtml(verifyHtml);
  const authenticated =
    verifyResponse.status < 400 &&
    (verifyParsed.gameCount > 0 || looksLikeAuthenticatedGamesPage(verifyHtml));

  if (!authenticated || looksLikeLegacyLoginPage(verifyHtml)) {
    logInfo("Login rejected after session verification", {
      username,
      status: verifyResponse.status,
      session: maskSessionId(phpsessid),
      bodyPreview: buildBodyPreview(verifyHtml)
    });
    return { ok: false, error: "Invalid username or password" };
  }

  logInfo("Login succeeded with PHPSESSID", {
    username,
    phpsessid: maskSessionId(phpsessid)
  });

  return { ok: true, phpsessid };
}

module.exports = {
  loginToLegacy
};

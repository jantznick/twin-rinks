"use strict";

const {
  LEGACY_BASE_URL,
  LEGACY_LOGIN_PATH,
  LOG_SENSITIVE
} = require("../config");

function getPhpSessionId(setCookieHeaders) {
  if (!setCookieHeaders) {
    return null;
  }

  const headers = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : [setCookieHeaders];

  for (const cookieHeader of headers) {
    const match = String(cookieHeader).match(/PHPSESSID=([^;,\s]+)/i);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

function buildLoginUrl(username, password) {
  const url = new URL(LEGACY_LOGIN_PATH, LEGACY_BASE_URL);
  url.searchParams.set("subs_data1", username);
  url.searchParams.set("subs_data2", password);
  return url.toString();
}

function redactLoginUrl(urlString) {
  if (LOG_SENSITIVE) {
    return urlString;
  }
  try {
    const url = new URL(urlString);
    if (url.searchParams.has("subs_data2")) {
      url.searchParams.set("subs_data2", "[redacted]");
    }
    return url.toString();
  } catch {
    return urlString;
  }
}

function maskSessionId(sessionId) {
  if (!sessionId) {
    return null;
  }
  if (sessionId.length <= 8) {
    return "***";
  }
  return `${sessionId.slice(0, 4)}...${sessionId.slice(-4)}`;
}

function getSessionFromRequest(req) {
  return (
    req.body?.phpsessid ||
    req.query?.phpsessid ||
    req.headers["x-phpsessid"] ||
    null
  );
}

module.exports = {
  getPhpSessionId,
  buildLoginUrl,
  redactLoginUrl,
  maskSessionId,
  getSessionFromRequest
};

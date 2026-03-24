"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { parseSubsHtml, parseProfileHtml } = require("./subs-parser");

const app = express();

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

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173"
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function logInfo(message, details) {
  const timestamp = new Date().toISOString();
  if (details) {
    console.log(`${LOG_PREFIX} ${timestamp} ${message}`, details);
  } else {
    console.log(`${LOG_PREFIX} ${timestamp} ${message}`);
  }
}

function headersToObject(headers) {
  const result = {};
  for (const [key, value] of headers.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function buildBodyPreview(bodyText) {
  if (!bodyText) {
    return "";
  }
  const normalized = String(bodyText).replace(/\s+/g, " ").trim();
  if (normalized.length <= BODY_PREVIEW_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, BODY_PREVIEW_LIMIT)}... [truncated]`;
}

function shellQuote(value) {
  const input = String(value ?? "");
  return `'${input.replace(/'/g, "'\"'\"'")}'`;
}

function buildCurlCommand({ method, url, headers = {}, body = null }) {
  const parts = [`curl -i -X ${method.toUpperCase()} ${shellQuote(url)}`];
  for (const [key, value] of Object.entries(headers)) {
    parts.push(`-H ${shellQuote(`${key}: ${value}`)}`);
  }
  if (body) {
    parts.push(`--data ${shellQuote(body)}`);
  }
  return parts.join(" \\\n  ");
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

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    logInfo(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`);
  });
  next();
});

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

function getSessionFromRequest(req) {
  return (
    req.body?.phpsessid ||
    req.query?.phpsessid ||
    req.headers["x-phpsessid"] ||
    null
  );
}

function parseInputAttributes(inputTag) {
  const attributes = {};
  const attrRegex = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;
  let match = attrRegex.exec(inputTag);

  while (match) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes[key] = value;
    match = attrRegex.exec(inputTag);
  }

  return attributes;
}

function extractGames(sectionHtml) {
  const games = [];
  const ids = new Set();

  const inputRegex = /<input\b[^>]*>/gi;
  let inputMatch = inputRegex.exec(sectionHtml);
  const parsedInputs = [];

  while (inputMatch) {
    const attrs = parseInputAttributes(inputMatch[0]);
    parsedInputs.push(attrs);
    const idMatch = (attrs.name || "").match(/^g(\d+)/i);
    if (idMatch) {
      ids.add(idMatch[1]);
    }
    inputMatch = inputRegex.exec(sectionHtml);
  }

  [...ids]
    .sort((a, b) => Number(a) - Number(b))
    .forEach((id) => {
      const detailsInput =
        parsedInputs.find((input) => input.name === `g${id}`) || null;
      const selectionInputs = parsedInputs.filter(
        (input) => input.name === `g${id}i`
      );

      const selectionOptions = [];
      let selectedValue = null;

      for (const input of selectionInputs) {
        const type = (input.type || "").toLowerCase();
        const value = input.value || "";
        const checked = Object.prototype.hasOwnProperty.call(input, "checked");

        if (checked) {
          selectedValue = value;
        }

        selectionOptions.push({
          type,
          value,
          checked
        });
      }

      games.push({
        gameId: `g${id}`,
        description: detailsInput?.value || null,
        selectedValue,
        options: selectionOptions
      });
    });

  return games;
}

function findGamesSection(html) {
  const tableRegex = /<table\b[\s\S]*?<\/table>/gi;
  let tableMatch = tableRegex.exec(html);

  while (tableMatch) {
    const tableHtml = tableMatch[0];
    const hasGameInputs = /name=["']g\d+i?["']/i.test(tableHtml);
    const hasGamesText = /your games/i.test(tableHtml);
    if (hasGameInputs || hasGamesText) {
      return { type: "table", html: tableHtml };
    }
    tableMatch = tableRegex.exec(html);
  }

  const formRegex = /<form\b[\s\S]*?<\/form>/gi;
  let formMatch = formRegex.exec(html);
  while (formMatch) {
    const formHtml = formMatch[0];
    const hasGameInputs = /name=["']g\d+i?["']/i.test(formHtml);
    const hasGamesText = /your games/i.test(formHtml);
    if (hasGameInputs || hasGamesText) {
      return { type: "form", html: formHtml };
    }
    formMatch = formRegex.exec(html);
  }

  const hasAnyGameInputs = /name=["']g\d+i?["']/i.test(html);
  if (hasAnyGameInputs) {
    return { type: "document", html };
  }

  return null;
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function looksLikeAuthenticatedGamesPage(html) {
  const text = String(html || "");
  if (!text) {
    return false;
  }

  // Common legacy markers we only expect after a successful login.
  if (/Games you can sub in:/i.test(text)) {
    return true;
  }
  if (/Click here to update your profile information/i.test(text)) {
    return true;
  }
  if (/name=["']profile["']/i.test(text)) {
    return true;
  }
  if (/name=["']g\d+i?["']/i.test(text)) {
    return true;
  }

  // Common login failure markers.
  if (/name=["']subs_data1["']/i.test(text) || /name=["']subs_data2["']/i.test(text)) {
    return false;
  }
  if (/invalid\s+(user(name)?|login|password|credentials)/i.test(text)) {
    return false;
  }

  return false;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/verify-access", (req, res) => {
  const { password } = req.body || {};
  
  if (!SITE_ACCESS_PASSWORD) {
    return res.json({ ok: true, message: "No password configured" });
  }
  
  if (password === SITE_ACCESS_PASSWORD) {
    return res.json({ ok: true });
  }
  
  return res.status(401).json({ ok: false, error: "Invalid password" });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      ok: false,
      error: "username and password are required"
    });
  }

  try {
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
      setCookieHeaders,
      bodyPreview
    });

    if (response.status >= 400) {
      return res.status(401).json({
        ok: false,
        error: `Legacy login request failed with status ${response.status}`
      });
    }

    const phpsessid = getPhpSessionId(setCookieHeaders);

    if (!phpsessid) {
      logInfo("No PHPSESSID found in login response", {
        status: response.status,
        location: locationHeader,
        headers: responseHeaders,
        setCookieHeaders,
        bodyPreview
      });
      return res.status(401).json({
        ok: false,
        error: "Login failed: no PHPSESSID returned",
        debug: {
          status: response.status,
          location: locationHeader,
          setCookieCount: setCookieHeaders.length,
          headers: responseHeaders,
          bodyPreview
        }
      });
    }

    logInfo("Login succeeded with PHPSESSID", {
      username,
      phpsessid: maskSessionId(phpsessid)
    });

    // The legacy system can return a PHPSESSID even when credentials are invalid.
    // Verify the session can access authenticated content before reporting success.
    const gamesUrl = new URL(LEGACY_GAMES_PATH, LEGACY_BASE_URL).toString();
    const verifyResponse = await fetch(gamesUrl, {
      method: "GET",
      headers: {
        Cookie: `PHPSESSID=${phpsessid}`
      }
    });
    const verifyHtml = await verifyResponse.text();
    const verifyParsed = parseSubsHtml(verifyHtml);
    const authenticated =
      verifyResponse.status < 400 &&
      (verifyParsed.gameCount > 0 || looksLikeAuthenticatedGamesPage(verifyHtml));

    if (!authenticated) {
      logInfo("Login rejected after session verification", {
        username,
        status: verifyResponse.status,
        session: maskSessionId(phpsessid),
        bodyPreview: buildBodyPreview(verifyHtml)
      });
      return res.status(401).json({
        ok: false,
        error: "Invalid username or password"
      });
    }

    return res.json({
      ok: true,
      phpsessid
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "Legacy login request failed",
      details: error.message
    });
  }
});

async function handleGetGames(req, res) {
  const phpsessid = getSessionFromRequest(req);

  if (!phpsessid) {
    return res.status(400).json({
      ok: false,
      error: "phpsessid is required (body, query, or x-phpsessid header)"
    });
  }

  try {
    const gamesUrl = new URL(LEGACY_GAMES_PATH, LEGACY_BASE_URL).toString();
    const cookieValueForLogs = LOG_SENSITIVE
      ? `PHPSESSID=${phpsessid}`
      : `PHPSESSID=${maskSessionId(phpsessid)}`;
    const gamesCurl = buildCurlCommand({
      method: "GET",
      url: gamesUrl,
      headers: {
        Cookie: cookieValueForLogs
      }
    });
    logInfo("Fetching games from legacy", {
      session: maskSessionId(phpsessid)
    });
    logInfo("Legacy games request target", {
      url: gamesUrl,
      command: gamesCurl
    });
    const response = await fetch(gamesUrl, {
      method: "GET",
      headers: {
        Cookie: `PHPSESSID=${phpsessid}`
      }
    });
    const responseHeaders = headersToObject(response.headers);
    const html = await response.text();
    const bodyPreview = buildBodyPreview(html);

    logInfo("Legacy games response received", {
      status: response.status,
      location: response.headers.get("location"),
      headers: responseHeaders,
      bodyPreview
    });

    if (html.includes("<b>Parse error</b>:") || html.includes("syntax error, unexpected")) {
      logInfo("Legacy games response indicates uploading state", {
        session: maskSessionId(phpsessid)
      });
      return res.status(503).json({
        ok: false,
        error: "uploading",
        message: "Games are in the process of being uploaded."
      });
    }

    if (response.status >= 400) {
      return res.status(401).json({
        ok: false,
        error: `Legacy games request failed with status ${response.status}`
      });
    }

    const parsed = parseSubsHtml(html);
    if (parsed.gameCount === 0) {
      logInfo("Games table missing in legacy response", {
        responseLength: html.length,
        session: maskSessionId(phpsessid),
        headers: responseHeaders,
        bodyPreview
      });
      return res.status(422).json({
        ok: false,
        error: "Games table not found in response",
        hint: "Session may be invalid or page layout changed"
      });
    }

    logInfo("Games parsed successfully", {
      gameCount: parsed.gameCount,
      hasProfile: !!parsed.profile,
      session: maskSessionId(phpsessid)
    });

    return res.json({
      ok: true,
      gameCount: parsed.gameCount,
      profile: parsed.profile,
      profilePath: parsed.profilePath,
      sourceType: "rows",
      games: parsed.games
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "Legacy games request failed",
      details: error.message
    });
  }
}

app.get("/get-games", handleGetGames);
app.post("/get-games", handleGetGames);

async function handleGetProfile(req, res) {
  const phpsessid = getSessionFromRequest(req);
  const profilePath = req.query?.profilePath || req.body?.profilePath;

  if (!phpsessid) {
    return res.status(400).json({ ok: false, error: "phpsessid is required" });
  }
  if (!profilePath) {
    return res.status(400).json({ ok: false, error: "profilePath is required" });
  }

  try {
    // Ensure base URL has a trailing slash so relative paths like "ZPROJAN0987.php" resolve correctly
    const baseUrl = LEGACY_BASE_URL.endsWith('/') ? LEGACY_BASE_URL : `${LEGACY_BASE_URL}/`;
    const profileUrl = new URL(profilePath, baseUrl).toString();
    
    const cookieValueForLogs = LOG_SENSITIVE
      ? `PHPSESSID=${phpsessid}`
      : `PHPSESSID=${maskSessionId(phpsessid)}`;
      
    const profileCurl = buildCurlCommand({
      method: "GET",
      url: profileUrl,
      headers: {
        Cookie: cookieValueForLogs
      }
    });

    logInfo("Fetching profile from legacy", {
      session: maskSessionId(phpsessid),
      profilePath
    });
    logInfo("Legacy profile request target", {
      url: profileUrl,
      command: profileCurl
    });

    const response = await fetch(profileUrl, {
      method: "GET",
      headers: {
        Cookie: `PHPSESSID=${phpsessid}`
      }
    });
    
    const responseHeaders = headersToObject(response.headers);
    const html = await response.text();
    const bodyPreview = buildBodyPreview(html);
    
    logInfo("Legacy profile response received", {
      status: response.status,
      location: response.headers.get("location"),
      headers: responseHeaders,
      bodyPreview
    });

    if (response.status >= 400) {
      return res.status(401).json({
        ok: false,
        error: `Legacy profile request failed with status ${response.status}`
      });
    }

    const parsedProfile = parseProfileHtml(html);
    
    logInfo("Profile parsed successfully", {
      session: maskSessionId(phpsessid),
      hasEmail: !!parsedProfile.email
    });

    return res.json({
      ok: true,
      profile: parsedProfile
    });
  } catch (error) {
    logInfo("Legacy profile request failed", { error: error.message });
    return res.status(502).json({
      ok: false,
      error: "Legacy profile request failed",
      details: error.message
    });
  }
}

app.get("/get-profile", handleGetProfile);
app.post("/get-profile", handleGetProfile);

app.post("/update-games", async (req, res) => {
  const phpsessid = getSessionFromRequest(req);
  const { profile, games } = req.body || {};

  if (!phpsessid) {
    return res.status(400).json({ ok: false, error: "phpsessid is required" });
  }
  if (!profile) {
    return res.status(400).json({ ok: false, error: "profile is required" });
  }
  if (!Array.isArray(games)) {
    return res.status(400).json({ ok: false, error: "games array is required" });
  }

  try {
    const submitUrl = new URL(LEGACY_SUBMIT_PATH, LEGACY_BASE_URL).toString();
    const bodyParams = new URLSearchParams();
    
    // Boilerplate form fields
    bodyParams.append("action", "games update");
    bodyParams.append("profile", profile);
    
    // Append all games and their selections
    for (const game of games) {
      if (game.gameId && game.dateTimeRink) {
        bodyParams.append(game.gameId, game.dateTimeRink);
        if (game.selection) {
          bodyParams.append(`${game.gameId}i`, game.selection);
        }
      }
    }

    // More boilerplate fields from the legacy form
    bodyParams.append("submit", "Submit");
    bodyParams.append("required", "");
    bodyParams.append("data_order", "action,profile12/03/2015");
    
    // The legacy form sends a massive data_order string with all possible g1-g100 inputs
    const dataOrderParts = ["action", "profile"];
    for (let i = 1; i <= 100; i++) {
      dataOrderParts.push(`g${i}`, `g${i}i`);
    }
    bodyParams.append("data_order", dataOrderParts.join(","));
    
    bodyParams.append("outputfile", "../adulthockey/subs/subs_entry");
    bodyParams.append("countfile", "form1");
    bodyParams.append("emailfile", "form1");
    bodyParams.append("form_id", "My Test Form");
    bodyParams.append("ok_url", "../adulthockey/subs/subs_submit_ok.html");
    bodyParams.append("not_ok_url", "../adulthockey/subs/sub_submit_not_ok.html");

    const cookieValueForLogs = LOG_SENSITIVE
      ? `PHPSESSID=${phpsessid}`
      : `PHPSESSID=${maskSessionId(phpsessid)}`;
      
    const submitCurl = buildCurlCommand({
      method: "POST",
      url: submitUrl,
      headers: {
        Cookie: cookieValueForLogs,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams.toString()
    });

    logInfo("Submitting games to legacy", {
      session: maskSessionId(phpsessid),
      gamesCount: games.length
    });
    logInfo("Legacy submit request target", {
      url: submitUrl,
      command: submitCurl
    });

    const response = await fetch(submitUrl, {
      method: "POST",
      headers: {
        Cookie: `PHPSESSID=${phpsessid}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams,
      redirect: "manual" // We expect a 302 redirect on success
    });

    const responseHeaders = headersToObject(response.headers);
    const responseBody = await response.text();
    const bodyPreview = buildBodyPreview(responseBody);

    logInfo("Legacy submit response received", {
      status: response.status,
      location: response.headers.get("location"),
      headers: responseHeaders,
      bodyPreview
    });

    // The legacy script returns a 302 redirect on success
    if (response.status >= 400) {
      return res.status(401).json({
        ok: false,
        error: `Legacy submit request failed with status ${response.status}`
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    logInfo("Legacy submit request failed", { error: error.message });
    return res.status(502).json({
      ok: false,
      error: "Legacy submit request failed",
      details: error.message
    });
  }
});

app.post("/update-profile", async (req, res) => {
  const phpsessid = getSessionFromRequest(req);
  const profileData = req.body || {};

  if (!phpsessid) {
    return res.status(400).json({ ok: false, error: "phpsessid is required" });
  }

  try {
    const submitUrl = new URL(LEGACY_SUBMIT_PATH, LEGACY_BASE_URL).toString();
    const bodyParams = new URLSearchParams();

    // The fields from the profile update form
    const fields = [
      "profile", "email", "player", "pass", "position", "cell", "carrier", 
      "chatid"
    ];

    for (const field of fields) {
      if (profileData[field] !== undefined) {
        bodyParams.append(field, profileData[field]);
      }
    }

    // Handle timer fields - if disabled, send 0,0,0
    if (profileData.t_enabled === false) {
      bodyParams.append("t_day", "0");
      bodyParams.append("t_hou", "0");
      bodyParams.append("t_min", "0");
    } else {
      bodyParams.append("t_day", profileData.t_day || "0");
      bodyParams.append("t_hou", profileData.t_hou || "0");
      bodyParams.append("t_min", profileData.t_min || "0");
    }

    if (profileData.e_enabled === false) {
      bodyParams.append("e_day", "0");
      bodyParams.append("e_hou", "0");
      bodyParams.append("e_min", "0");
    } else {
      bodyParams.append("e_day", profileData.e_day || "0");
      bodyParams.append("e_hou", profileData.e_hou || "0");
      bodyParams.append("e_min", profileData.e_min || "0");
    }

    // Sub notifications don't have an explicit disable, but we'll send the values
    bodyParams.append("s_day", profileData.s_day || "0");
    bodyParams.append("s_hou", profileData.s_hou || "0");
    bodyParams.append("s_min", profileData.s_min || "0");

    if (profileData.test_text) bodyParams.append("text", "on");
    if (profileData.test_mail) bodyParams.append("mail", "on");

    // Boilerplate fields
    bodyParams.append("required", "position");
    bodyParams.append("data_order", "profile,player,email,pass,position,cell,carrier,chatid,t_day,t_hou,t_min,e_day,e_hou,e_min,s_day,s_hou,s_min,text,mail");
    bodyParams.append("outputfile", "../adulthockey/subs/subs_entry");
    bodyParams.append("countfile", "form1");
    bodyParams.append("emailfile", "form1");
    bodyParams.append("form_id", "My Test Form");
    bodyParams.append("ok_url", "../adulthockey/subs/subs_submit_ok.html");
    bodyParams.append("not_ok_url", "../adulthockey/subs/subs_submit_not_ok.html");

    const cookieValueForLogs = LOG_SENSITIVE
      ? `PHPSESSID=${phpsessid}`
      : `PHPSESSID=${maskSessionId(phpsessid)}`;

    const submitCurl = buildCurlCommand({
      method: "POST",
      url: submitUrl,
      headers: {
        Cookie: cookieValueForLogs,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams.toString()
    });

    logInfo("Submitting profile update to legacy", {
      session: maskSessionId(phpsessid)
    });
    logInfo("Legacy profile submit request target", {
      url: submitUrl,
      command: submitCurl
    });

    const response = await fetch(submitUrl, {
      method: "POST",
      headers: {
        Cookie: `PHPSESSID=${phpsessid}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams,
      redirect: "manual" // We expect a 302 redirect on success
    });

    const responseHeaders = headersToObject(response.headers);
    const responseBody = await response.text();
    const bodyPreview = buildBodyPreview(responseBody);

    logInfo("Legacy profile submit response received", {
      status: response.status,
      location: response.headers.get("location"),
      headers: responseHeaders,
      bodyPreview
    });

    // The legacy script returns a 302 redirect on success
    if (response.status >= 400) {
      return res.status(401).json({
        ok: false,
        error: `Legacy profile submit request failed with status ${response.status}`
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    logInfo("Legacy profile submit request failed", { error: error.message });
    return res.status(502).json({
      ok: false,
      error: "Legacy profile submit request failed",
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  logInfo(`Legacy middleware listening on http://localhost:${PORT}`, {
    legacyBaseUrl: LEGACY_BASE_URL,
    legacyLoginPath: LEGACY_LOGIN_PATH,
    legacyGamesPath: LEGACY_GAMES_PATH,
    logSensitive: LOG_SENSITIVE
  });
});

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { parseSubsHtml } = require("./subs-parser");

const app = express();

const PORT = process.env.PORT || 3001;
const LEGACY_BASE_URL =
  process.env.LEGACY_BASE_URL || "https://hockeydomain.com/adulthockey/subs";
const LEGACY_LOGIN_PATH = process.env.LEGACY_LOGIN_PATH || "/subs_entry.php";
const LEGACY_GAMES_PATH =
  process.env.LEGACY_GAMES_PATH || "/all_player_login.php";
const LOG_PREFIX = "[legacy-middleware]";
const BODY_PREVIEW_LIMIT = Number(process.env.BODY_PREVIEW_LIMIT || 4000);
const LOG_SENSITIVE = process.env.LOG_SENSITIVE === "1";
const SITE_ACCESS_PASSWORD = process.env.SITE_ACCESS_PASSWORD || "";

app.use(cors());
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
      session: maskSessionId(phpsessid)
    });

    return res.json({
      ok: true,
      gameCount: parsed.gameCount,
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

app.listen(PORT, () => {
  logInfo(`Legacy middleware listening on http://localhost:${PORT}`, {
    legacyBaseUrl: LEGACY_BASE_URL,
    legacyLoginPath: LEGACY_LOGIN_PATH,
    legacyGamesPath: LEGACY_GAMES_PATH,
    logSensitive: LOG_SENSITIVE
  });
});

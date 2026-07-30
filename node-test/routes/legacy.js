"use strict";

const express = require("express");
const {
  LEGACY_BASE_URL,
  LEGACY_GAMES_PATH,
  LEGACY_SUBMIT_PATH,
  LOG_SENSITIVE
} = require("../config");
const { parseSubsHtml, parseProfileHtml } = require("../subs-parser");
const { logInfo } = require("../utils/logger");
const {
  headersToObject,
  buildBodyPreview,
  buildCurlCommand
} = require("../utils/http");
const {
  looksLikeLegacyLoginPage,
  isLegacyLoginRedirect
} = require("../utils/legacy-pages");
const { maskSessionId } = require("../utils/legacy-session");
const { getPrisma } = require("../lib/prisma");
const {
  sanitizeSportsengineCalendars
} = require("../utils/sportsengine-calendars-storage");
const {
  getLegacyProfilePayload,
  forwardTwinRinksProfileToLegacy
} = require("../utils/legacy-profile-forward");
const { requireTwinRinksLink, requireAuth } = require("../middleware/auth");
const { getValidPhpsessid } = require("../utils/twin-rinks-session");

const router = express.Router();

async function resolveLegacySession(req, res) {
  const result = await getValidPhpsessid(req.user);
  if (!result.ok) {
    res.status(result.code === "twin_rinks_not_linked" ? 403 : 401).json({
      ok: false,
      error: result.error,
      code: result.code || "session_expired"
    });
    return null;
  }
  return result.phpsessid;
}

async function legacyFetchGames(req, res) {
  const phpsessid = await resolveLegacySession(req, res);
  if (!phpsessid) {
    return undefined;
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
        error: `Legacy games request failed with status ${response.status}`,
        code: "session_expired"
      });
    }

    if (isLegacyLoginRedirect(response) || looksLikeLegacyLoginPage(html)) {
      logInfo("Legacy games request hit login page (session expired)", {
        status: response.status,
        responseUrl: response.url,
        location: response.headers.get("location"),
        session: maskSessionId(phpsessid),
        bodyPreview
      });
      return res.status(401).json({
        ok: false,
        error: "Legacy session expired",
        code: "session_expired"
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
        code: "legacy_games_parse_failed",
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

router.get("/get-games", requireTwinRinksLink, legacyFetchGames);
router.post("/get-games", requireTwinRinksLink, legacyFetchGames);

async function legacyFetchProfile(req, res) {
  const phpsessid = await resolveLegacySession(req, res);
  if (!phpsessid) {
    return undefined;
  }
  const profilePath = req.query?.profilePath || req.body?.profilePath;

  if (!profilePath) {
    return res.status(400).json({ ok: false, error: "profilePath is required" });
  }

  try {
    const baseUrl = LEGACY_BASE_URL.endsWith("/")
      ? LEGACY_BASE_URL
      : `${LEGACY_BASE_URL}/`;
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
        error: `Legacy profile request failed with status ${response.status}`,
        code: "session_expired"
      });
    }

    if (isLegacyLoginRedirect(response) || looksLikeLegacyLoginPage(html)) {
      logInfo("Legacy profile request hit login page (session expired)", {
        status: response.status,
        responseUrl: response.url,
        location: response.headers.get("location"),
        session: maskSessionId(phpsessid),
        bodyPreview
      });
      return res.status(401).json({
        ok: false,
        error: "Legacy session expired",
        code: "session_expired"
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

router.get("/get-profile", requireTwinRinksLink, legacyFetchProfile);
router.post("/get-profile", requireTwinRinksLink, legacyFetchProfile);

router.post("/update-games", requireTwinRinksLink, async (req, res) => {
  const phpsessid = await resolveLegacySession(req, res);
  if (!phpsessid) {
    return undefined;
  }
  const { profile, games } = req.body || {};

  if (!profile) {
    return res.status(400).json({ ok: false, error: "profile is required" });
  }
  if (!Array.isArray(games)) {
    return res.status(400).json({ ok: false, error: "games array is required" });
  }

  try {
    const submitUrl = new URL(LEGACY_SUBMIT_PATH, LEGACY_BASE_URL).toString();
    const bodyParams = new URLSearchParams();

    bodyParams.append("action", "games update");
    bodyParams.append("profile", profile);

    for (const game of games) {
      if (game.gameId && game.dateTimeRink) {
        bodyParams.append(game.gameId, game.dateTimeRink);
        if (game.selection) {
          bodyParams.append(`${game.gameId}i`, game.selection);
        }
      }
    }

    bodyParams.append("submit", "Submit");
    bodyParams.append("required", "");
    bodyParams.append("data_order", "action,profile12/03/2015");

    const dataOrderParts = ["action", "profile"];
    for (let i = 1; i <= 100; i += 1) {
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
      redirect: "manual"
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

    if (response.status >= 400) {
      return res.status(401).json({
        ok: false,
        error: `Legacy submit request failed with status ${response.status}`,
        code: "session_expired"
      });
    }

    if (isLegacyLoginRedirect(response) || looksLikeLegacyLoginPage(responseBody)) {
      logInfo("Legacy submit request redirected to login (session expired)", {
        status: response.status,
        responseUrl: response.url,
        location: response.headers.get("location"),
        session: maskSessionId(phpsessid),
        bodyPreview
      });
      return res.status(401).json({
        ok: false,
        error: "Legacy session expired",
        code: "session_expired"
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

router.post("/update-profile", requireAuth, async (req, res) => {
  const body = req.body || {};
  const key = req.user.email;
  const hasCalendarsKey = Object.prototype.hasOwnProperty.call(
    body,
    "sportsengineCalendars"
  );
  const legacyPayload = getLegacyProfilePayload(body);

  if (!legacyPayload && !hasCalendarsKey) {
    return res.status(400).json({
      ok: false,
      error: "Nothing to update (send twinRinksProfile and/or sportsengineCalendars)"
    });
  }

  let legacyUpdated = false;
  let calendarsUpdated = false;
  let savedCalendars = null;

  if (legacyPayload) {
    if (!req.user.twinRinksUsername || !req.user.twinRinksPasswordEnc) {
      return res.status(403).json({
        ok: false,
        error: "Twin Rinks account not linked",
        code: "twin_rinks_not_linked"
      });
    }
    const phpsessid = await resolveLegacySession(req, res);
    if (!phpsessid) {
      return undefined;
    }
    const legacyResult = await forwardTwinRinksProfileToLegacy(phpsessid, legacyPayload);
    if (!legacyResult.ok) {
      return res.status(legacyResult.status).json(legacyResult.body);
    }
    legacyUpdated = true;
  }

  if (hasCalendarsKey) {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        ok: false,
        error: "Database is not configured (DATABASE_URL missing)",
        code: "database_unavailable"
      });
    }
    const calendars = sanitizeSportsengineCalendars(body.sportsengineCalendars);
    await prisma.user.upsert({
      where: { email: key },
      create: {
        email: key,
        sportsengineCalendars: calendars
      },
      update: {
        sportsengineCalendars: calendars
      }
    });
    calendarsUpdated = true;
    savedCalendars = calendars;
    logInfo("SportsEngine calendars saved (via update-profile)", {
      email: key,
      count: calendars.length
    });
  }

  return res.json({
    ok: true,
    legacyUpdated,
    calendarsUpdated,
    ...(savedCalendars !== null ? { sportsengineCalendars: savedCalendars } : {})
  });
});

module.exports = router;

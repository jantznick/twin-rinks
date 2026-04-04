"use strict";

const {
  LEGACY_BASE_URL,
  LEGACY_LOGIN_PATH,
  LEGACY_GAMES_PATH,
  LEGACY_SUBMIT_PATH,
  LOG_SENSITIVE,
  SITE_ACCESS_PASSWORD
} = require("../config");
const { parseSubsHtml, parseProfileHtml } = require("../subs-parser");
const { logInfo } = require("../utils/logger");
const {
  headersToObject,
  buildBodyPreview,
  buildCurlCommand,
  getSetCookieHeaders
} = require("../utils/http");
const {
  looksLikeAuthenticatedGamesPage,
  looksLikeLegacyLoginPage,
  isLegacyLoginRedirect
} = require("../utils/legacy-pages");
const {
  getPhpSessionId,
  buildLoginUrl,
  redactLoginUrl,
  maskSessionId,
  getSessionFromRequest
} = require("../utils/legacy-session");

function registerLegacyRoutes(app) {
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

  app.post("/update-profile", async (req, res) => {
    const phpsessid = getSessionFromRequest(req);
    const profileData = req.body || {};

    if (!phpsessid) {
      return res.status(400).json({ ok: false, error: "phpsessid is required" });
    }

    try {
      const submitUrl = new URL(LEGACY_SUBMIT_PATH, LEGACY_BASE_URL).toString();
      const bodyParams = new URLSearchParams();

      const fields = [
        "profile",
        "email",
        "player",
        "pass",
        "position",
        "cell",
        "carrier",
        "chatid"
      ];

      for (const field of fields) {
        if (profileData[field] !== undefined) {
          bodyParams.append(field, profileData[field]);
        }
      }

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

      bodyParams.append("s_day", profileData.s_day || "0");
      bodyParams.append("s_hou", profileData.s_hou || "0");
      bodyParams.append("s_min", profileData.s_min || "0");

      if (profileData.test_text) bodyParams.append("text", "on");
      if (profileData.test_mail) bodyParams.append("mail", "on");

      bodyParams.append("required", "position");
      bodyParams.append(
        "data_order",
        "profile,player,email,pass,position,cell,carrier,chatid,t_day,t_hou,t_min,e_day,e_hou,e_min,s_day,s_hou,s_min,text,mail"
      );
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
        redirect: "manual"
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

      if (response.status >= 400) {
        return res.status(401).json({
          ok: false,
          error: `Legacy profile submit request failed with status ${response.status}`,
          code: "session_expired"
        });
      }

      if (isLegacyLoginRedirect(response) || looksLikeLegacyLoginPage(responseBody)) {
        logInfo("Legacy profile submit redirected to login (session expired)", {
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
      logInfo("Legacy profile submit request failed", { error: error.message });
      return res.status(502).json({
        ok: false,
        error: "Legacy profile submit request failed",
        details: error.message
      });
    }
  });
}

module.exports = registerLegacyRoutes;

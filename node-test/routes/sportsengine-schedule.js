"use strict";

const express = require("express");
const {
  parseSportsengineTeamScheduleHtml
} = require("../sportsengine-schedule-parser");
const { logInfo } = require("../utils/logger");
const {
  headersToObject,
  buildBodyPreview
} = require("../utils/http");
const { getSessionFromRequest } = require("../utils/legacy-session");
const { getEmailFromRequest } = require("../utils/email-from-request");
const { getPrisma } = require("../lib/prisma");
const {
  verifyTwinRinksSessionAndGetEmail,
  isEmailClaimValid,
  normalizeEmail
} = require("../utils/twin-rinks-session-verify");
const { isUuid } = require("../utils/sportsengine-calendars-storage");

const router = express.Router();

/** SportsEngine cells only give strings like "Thu Apr 9" — resolve to a calendar day in server local time. */
function gameDayFromDateRaw(dateRaw) {
  const cleaned = String(dateRaw || "").replace(/\s+/g, " ").trim();
  const m = cleaned.match(/\b([A-Za-z]{3})\s+([A-Za-z]{3})\s+(\d{1,2})\b/);
  if (!m) {
    return null;
  }
  const mon = m[2];
  const dayNum = Number(m[3]);
  const now = new Date();
  let year = now.getFullYear();
  let d = new Date(`${mon} ${dayNum}, ${year}`);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  if (d.getTime() < now.getTime() - 14 * 86400000) {
    year += 1;
    d = new Date(`${mon} ${dayNum}, ${year}`);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

async function fetchScheduleForStoredUrl(scheduleUrl, res, requestedScheduleId) {
  try {
    logInfo("SportsEngine team schedule request", { url: scheduleUrl });
    const response = await fetch(scheduleUrl, {
      method: "GET",
      redirect: "follow"
    });
    const html = await response.text();
    const bodyPreview = buildBodyPreview(html);
    const responseHeaders = headersToObject(response.headers);

    // logInfo("SportsEngine team schedule response received", {
    //   status: response.status,
    //   headers: responseHeaders,
    //   bodyPreview
    // });

    if (response.status >= 400) {
      return res.status(502).json({
        ok: false,
        error: `Schedule page request failed with status ${response.status}`,
        code: "sportsengine_schedule_fetch_failed"
      });
    }

    const parsed = parseSportsengineTeamScheduleHtml(html);
    if (parsed.gameCount === 0) {
      logInfo("SportsEngine schedule table missing or empty", {
        responseLength: html.length,
        bodyPreview
      });
      return res.status(422).json({
        ok: false,
        error: "Schedule table not found or no games parsed",
        code: "sportsengine_schedule_parse_failed",
        hint: "Page layout may have changed"
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const games = parsed.games.filter((g) => {
      const day = gameDayFromDateRaw(g.dateRaw);
      if (!day) {
        return true;
      }
      return day >= todayStart;
    });

    logInfo("SportsEngine team schedule parsed", {
      gameCountParsed: parsed.gameCount,
      gameCountReturned: games.length,
      teamName: parsed.teamName || null,
      parserVersion: parsed.parserVersion
    });

    return res.json({
      ok: true,
      sourceUrl: scheduleUrl,
      requestedScheduleId: requestedScheduleId || undefined,
      teamName: parsed.teamName || null,
      gameCount: games.length,
      parserVersion: parsed.parserVersion,
      games
    });
  } catch (error) {
    logInfo("SportsEngine team schedule request failed", {
      error: error.message
    });
    return res.status(502).json({
      ok: false,
      error: "SportsEngine team schedule request failed",
      details: error.message
    });
  }
}

/**
 * Fetches a schedule by opaque scheduleId only. URL is resolved from the signed-in user's
 * stored calendar rows (validated when saved) — no arbitrary URL fetch (SSRF-safe).
 */
router.post("/team-schedule", async (req, res) => {
  const prisma = getPrisma();
  if (!prisma) {
    return res.status(503).json({
      ok: false,
      error: "Database is not configured (DATABASE_URL missing)",
      code: "database_unavailable"
    });
  }

  const scheduleId = String(req.body?.scheduleId ?? "").trim();
  const phpsessid = getSessionFromRequest(req);
  const claimedEmail = getEmailFromRequest(req);

  if (!scheduleId || !isUuid(scheduleId)) {
    return res.status(400).json({
      ok: false,
      error: "scheduleId (UUID) is required",
      code: "sportsengine_schedule_id_required"
    });
  }
  if (!phpsessid) {
    return res.status(400).json({ ok: false, error: "phpsessid is required" });
  }
  if (!claimedEmail) {
    return res.status(400).json({ ok: false, error: "email is required" });
  }

  const session = await verifyTwinRinksSessionAndGetEmail(phpsessid);
  if (!session.ok) {
    return res.status(401).json({
      ok: false,
      error: "Legacy session invalid or expired",
      code: session.code || "session_expired"
    });
  }
  if (!isEmailClaimValid(session.email, claimedEmail)) {
    return res.status(403).json({
      ok: false,
      error: "email does not match Twin Rinks session",
      code: "email_mismatch"
    });
  }

  const key = normalizeEmail(session.email);
  const row = await prisma.user.findUnique({ where: { email: key } });
  const raw = row?.sportsengineCalendars;
  const calendars = Array.isArray(raw) ? raw : [];
  const entry = calendars.find(
    (c) => c && typeof c === "object" && String(c.scheduleId || "").trim() === scheduleId
  );
  if (!entry || !entry.url) {
    return res.status(404).json({
      ok: false,
      error: "Unknown scheduleId or calendar not saved for this account",
      code: "sportsengine_schedule_not_found"
    });
  }

  const scheduleUrl = String(entry.url).trim();
  return fetchScheduleForStoredUrl(scheduleUrl, res, scheduleId);
});

module.exports = router;

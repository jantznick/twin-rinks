"use strict";

const { getPrisma } = require("../lib/prisma");
const { getSessionFromRequest } = require("../utils/legacy-session");
const {
  verifyTwinRinksSessionAndGetEmail,
  isEmailClaimValid,
  normalizeEmail
} = require("../utils/twin-rinks-session-verify");
const { logInfo } = require("../utils/logger");

function getEmailFromRequest(req) {
  return (
    req.body?.email ||
    req.query?.email ||
    req.headers["x-user-email"] ||
    ""
  );
}

function sanitizeUrls(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const s = String(item ?? "").trim();
    if (!s || seen.has(s)) {
      continue;
    }
    seen.add(s);
    out.push(s);
  }
  return out;
}

function registerUserSettingsRoutes(app) {
  async function handleGetSportsengineCalendars(req, res) {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        ok: false,
        error: "Database is not configured (DATABASE_URL missing)",
        code: "database_unavailable"
      });
    }

    const phpsessid = getSessionFromRequest(req);
    const claimedEmail = getEmailFromRequest(req);
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
      logInfo("SportsEngine calendar GET: email mismatch", {
        sessionEmail: session.email
      });
      return res.status(403).json({
        ok: false,
        error: "email does not match Twin Rinks session",
        code: "email_mismatch"
      });
    }

    const key = normalizeEmail(session.email);
    const row = await prisma.user.findUnique({ where: { email: key } });
    const urls = row?.sportsengineCalendarUrls ?? [];

    return res.json({
      ok: true,
      email: key,
      sportsengineCalendarUrls: urls
    });
  }

  async function handlePutSportsengineCalendars(req, res) {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        ok: false,
        error: "Database is not configured (DATABASE_URL missing)",
        code: "database_unavailable"
      });
    }

    const phpsessid = getSessionFromRequest(req);
    const claimedEmail = getEmailFromRequest(req);
    const urls = sanitizeUrls(req.body?.sportsengineCalendarUrls);

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
    await prisma.user.upsert({
      where: { email: key },
      create: {
        email: key,
        sportsengineCalendarUrls: urls
      },
      update: {
        sportsengineCalendarUrls: urls
      }
    });

    logInfo("SportsEngine calendar URLs saved", { email: key, count: urls.length });

    return res.json({
      ok: true,
      email: key,
      sportsengineCalendarUrls: urls
    });
  }

  app.get("/user/sportsengine-calendars", handleGetSportsengineCalendars);
  app.post("/user/sportsengine-calendars", handleGetSportsengineCalendars);
  app.put("/user/sportsengine-calendars", handlePutSportsengineCalendars);
}

module.exports = registerUserSettingsRoutes;

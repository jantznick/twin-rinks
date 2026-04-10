"use strict";

const express = require("express");
const { getPrisma } = require("../lib/prisma");
const { getSessionFromRequest } = require("../utils/legacy-session");
const {
  verifyTwinRinksSessionAndGetEmail,
  isEmailClaimValid,
  normalizeEmail
} = require("../utils/twin-rinks-session-verify");
const { logInfo } = require("../utils/logger");
const {
  sanitizeSportsengineCalendars
} = require("../lib/sportsengine-calendars-sanitize");
const { getEmailFromRequest } = require("../utils/email-from-request");

const router = express.Router();

router.get("/sportsengine-calendars", async (req, res) => {
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
  const raw = row?.sportsengineCalendars;
  const calendars = Array.isArray(raw) ? raw : [];

  return res.json({
    ok: true,
    email: key,
    sportsengineCalendars: calendars
  });
});

router.post("/sportsengine-calendars", async (req, res) => {
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
  const raw = row?.sportsengineCalendars;
  const calendars = Array.isArray(raw) ? raw : [];

  return res.json({
    ok: true,
    email: key,
    sportsengineCalendars: calendars
  });
});

router.put("/sportsengine-calendars", async (req, res) => {
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
  const bodyCalendars =
    req.body?.sportsengineCalendars ?? req.body?.sportsengineCalendarUrls;
  const calendars = sanitizeSportsengineCalendars(bodyCalendars);

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
      sportsengineCalendars: calendars
    },
    update: {
      sportsengineCalendars: calendars
    }
  });

  logInfo("SportsEngine calendars saved", { email: key, count: calendars.length });

  return res.json({
    ok: true,
    email: key,
    sportsengineCalendars: calendars
  });
});

module.exports = router;

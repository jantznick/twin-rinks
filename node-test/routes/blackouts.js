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
const { getEmailFromRequest } = require("../utils/email-from-request");
const {
  sanitizeBlackoutRulesList,
  formatRuleForClient
} = require("../utils/blackout-rules");
const { backfillScheduleIds } = require("../utils/sportsengine-calendars-storage");

const router = express.Router();

async function getUserRowWithCalendars(prisma, emailKey) {
  let row = await prisma.user.findUnique({
    where: { email: emailKey },
    include: { blackoutRules: { orderBy: { createdAt: "asc" } } }
  });
  if (!row) {
    row = await prisma.user.create({
      data: { email: emailKey },
      include: { blackoutRules: { orderBy: { createdAt: "asc" } } }
    });
    return row;
  }
  const raw = row.sportsengineCalendars;
  const calendars = Array.isArray(raw) ? raw : [];
  const { calendars: out, changed } = backfillScheduleIds(calendars);
  if (changed) {
    row = await prisma.user.update({
      where: { email: emailKey },
      data: { sportsengineCalendars: out },
      include: { blackoutRules: { orderBy: { createdAt: "asc" } } }
    });
  }
  return row;
}

async function handleGetBlackouts(req, res) {
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
    return res.status(403).json({
      ok: false,
      error: "email does not match Twin Rinks session",
      code: "email_mismatch"
    });
  }

  const key = normalizeEmail(session.email);
  const row = await getUserRowWithCalendars(prisma, key);
  const rules = (row.blackoutRules || []).map(formatRuleForClient);

  return res.json({
    ok: true,
    email: key,
    rules
  });
}

async function handlePutBlackouts(req, res) {
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
  const rawList = req.body?.rules;

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
  const row = await getUserRowWithCalendars(prisma, key);
  const calendars = Array.isArray(row.sportsengineCalendars)
    ? row.sportsengineCalendars
    : [];

  const { rules: sanitized } = sanitizeBlackoutRulesList(rawList, calendars);

  await prisma.$transaction(async (tx) => {
    await tx.blackoutRule.deleteMany({ where: { userId: row.id } });
    if (sanitized.length > 0) {
      await tx.blackoutRule.createMany({
        data: sanitized.map((r) => ({
          userId: row.id,
          recurrenceKind: r.recurrenceKind,
          oneOffDate: r.oneOffDate,
          weekday: r.weekday,
          monthOrdinal: r.monthOrdinal,
          leagueScopes: r.leagueScopes,
          note: r.note
        }))
      });
    }
  });

  const updated = await prisma.blackoutRule.findMany({
    where: { userId: row.id },
    orderBy: { createdAt: "asc" }
  });

  logInfo("Blackout rules saved", { email: key, count: updated.length });

  return res.json({
    ok: true,
    email: key,
    rules: updated.map(formatRuleForClient)
  });
}

router.get("/blackouts", handleGetBlackouts);
router.post("/blackouts", handleGetBlackouts);
router.put("/blackouts", handlePutBlackouts);

module.exports = router;

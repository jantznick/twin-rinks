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
const { sanitizeLastSyncErrorForApi } = require("../utils/prisma-missing-table");

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

  let calendarSubscriptions = [];
  let calendarBlocklist = [];
  try {
    calendarSubscriptions = await prisma.calendarSubscription.findMany({
      where: { userId: row.id },
      orderBy: { createdAt: "asc" }
    });
  } catch (err) {
    if (err.code !== "P2021") {
      throw err;
    }
    logInfo("CalendarSubscription table missing; skip calendar subscriptions", {
      email: key
    });
  }
  try {
    calendarBlocklist = await prisma.calendarBlocklistEntry.findMany({
      where: { subscription: { userId: row.id } },
      include: { subscription: { select: { label: true, leagueScopes: true } } },
      orderBy: [{ dateKeyChicago: "asc" }, { instanceStartUtc: "asc" }]
    });
  } catch (err) {
    if (err.code !== "P2021") {
      throw err;
    }
    logInfo("CalendarBlocklistEntry table missing; skip imported blocklist rows", {
      email: key
    });
  }

  return res.json({
    ok: true,
    email: key,
    rules,
    subWarnIfSameDayGame: Boolean(row.subWarnIfSameDayGame),
    subWarnIfAdjacentGameDays: Boolean(row.subWarnIfAdjacentGameDays),
    twinRinksSeasonLeague: row.twinRinksSeasonLeague ?? "",
    twinRinksSeasonTeam: row.twinRinksSeasonTeam ?? "",
    calendarSubscriptions: calendarSubscriptions.map((s) => ({
      id: s.id,
      url: s.url,
      label: s.label,
      mode: s.mode,
      leagueScopes: Array.isArray(s.leagueScopes)
        ? s.leagueScopes
        : JSON.parse(JSON.stringify(s.leagueScopes || [])),
      syncStatus: s.syncStatus,
      lastSyncAt: s.lastSyncAt ? s.lastSyncAt.toISOString() : null,
      lastSyncError: sanitizeLastSyncErrorForApi(s.lastSyncError),
      createdAt: s.createdAt.toISOString()
    })),
    calendarBlocklist: calendarBlocklist.map((e) => ({
      id: e.id,
      subscriptionId: e.subscriptionId,
      subscriptionLabel: e.subscription?.label || null,
      leagueScopes: Array.isArray(e.subscription?.leagueScopes)
        ? e.subscription.leagueScopes
        : [],
      icsUid: e.icsUid,
      recurrenceId: e.recurrenceId,
      instanceStartUtc: e.instanceStartUtc.toISOString(),
      dateKeyChicago: e.dateKeyChicago,
      note: e.note,
      status: e.status
    }))
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

async function handlePatchBlackoutPreferences(req, res) {
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
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const data = {};
  if ("subWarnIfSameDayGame" in body) {
    data.subWarnIfSameDayGame = Boolean(body.subWarnIfSameDayGame);
  }
  if ("subWarnIfAdjacentGameDays" in body) {
    data.subWarnIfAdjacentGameDays = Boolean(body.subWarnIfAdjacentGameDays);
  }
  if ("twinRinksSeasonLeague" in body) {
    const v = body.twinRinksSeasonLeague;
    data.twinRinksSeasonLeague =
      v === null || v === undefined ? null : String(v).trim() || null;
  }
  if ("twinRinksSeasonTeam" in body) {
    const v = body.twinRinksSeasonTeam;
    data.twinRinksSeasonTeam =
      v === null || v === undefined ? null : String(v).trim() || null;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ ok: false, error: "No valid preference fields" });
  }

  const row = await prisma.user.upsert({
    where: { email: key },
    create: { email: key, ...data },
    update: data
  });

  return res.json({
    ok: true,
    subWarnIfSameDayGame: Boolean(row.subWarnIfSameDayGame),
    subWarnIfAdjacentGameDays: Boolean(row.subWarnIfAdjacentGameDays),
    twinRinksSeasonLeague: row.twinRinksSeasonLeague ?? "",
    twinRinksSeasonTeam: row.twinRinksSeasonTeam ?? ""
  });
}

router.get("/blackouts", handleGetBlackouts);
router.post("/blackouts", handleGetBlackouts);
router.put("/blackouts", handlePutBlackouts);
router.patch("/blackouts/preferences", handlePatchBlackoutPreferences);

module.exports = router;

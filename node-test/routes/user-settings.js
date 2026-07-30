"use strict";

const express = require("express");
const { getPrisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { logInfo } = require("../utils/logger");
const {
  sanitizeSportsengineCalendars,
  backfillScheduleIds
} = require("../utils/sportsengine-calendars-storage");

const router = express.Router();

async function handleReadSportsengineCalendars(req, res) {
  const prisma = getPrisma();
  if (!prisma) {
    return res.status(503).json({
      ok: false,
      error: "Database is not configured (DATABASE_URL missing)",
      code: "database_unavailable"
    });
  }

  const key = req.user.email;
  const row = await prisma.user.findUnique({ where: { email: key } });
  const raw = row?.sportsengineCalendars;
  const calendars = Array.isArray(raw) ? raw : [];
  const { calendars: out, changed } = backfillScheduleIds(calendars);
  if (changed) {
    await prisma.user.update({
      where: { email: key },
      data: { sportsengineCalendars: out }
    });
  }

  return res.json({
    ok: true,
    email: key,
    sportsengineCalendars: out
  });
}

router.get("/sportsengine-calendars", requireAuth, handleReadSportsengineCalendars);
router.post("/sportsengine-calendars", requireAuth, handleReadSportsengineCalendars);

router.put("/sportsengine-calendars", requireAuth, async (req, res) => {
  const prisma = getPrisma();
  if (!prisma) {
    return res.status(503).json({
      ok: false,
      error: "Database is not configured (DATABASE_URL missing)",
      code: "database_unavailable"
    });
  }

  const bodyCalendars =
    req.body?.sportsengineCalendars ?? req.body?.sportsengineCalendarUrls;
  const calendars = sanitizeSportsengineCalendars(bodyCalendars);
  const key = req.user.email;

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

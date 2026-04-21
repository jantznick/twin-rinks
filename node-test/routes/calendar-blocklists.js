"use strict";

const express = require("express");
const { getPrisma } = require("../lib/prisma");
const { getSessionFromRequest } = require("../utils/legacy-session");
const {
  verifyTwinRinksSessionAndGetEmail,
  isEmailClaimValid,
  normalizeEmail
} = require("../utils/twin-rinks-session-verify");
const { getEmailFromRequest } = require("../utils/email-from-request");
const { logInfo } = require("../utils/logger");
const { isAllowedCalendarUrl, normalizeWebcalToHttps } = require("../utils/calendar-url");
const {
  expandIcsToInstances,
  extractCalendarLabelFromIcs,
  fetchCalendarText,
  instanceKey
} = require("../utils/ics-instances");
const {
  MODE_ALL,
  MODE_PICK,
  runSubscriptionSync
} = require("../utils/calendar-sync");
const {
  isPrismaTableMissing,
  blocklistTableMissingResponseBody,
  sanitizeLastSyncErrorForApi
} = require("../utils/prisma-missing-table");

const router = express.Router();

function formatSubscription(s) {
  return {
    id: s.id,
    url: s.url,
    label: s.label,
    mode: s.mode,
    leagueScopes: Array.isArray(s.leagueScopes) ? s.leagueScopes : [],
    syncStatus: s.syncStatus,
    lastSyncAt: s.lastSyncAt ? s.lastSyncAt.toISOString() : null,
    lastSyncError: sanitizeLastSyncErrorForApi(s.lastSyncError),
    createdAt: s.createdAt.toISOString()
  };
}

/**
 * Pick-mode never runs full `reconcileSubscription`; still record feed read (name + last sync).
 */
async function recordPickFeedTouch(prisma, subscriptionId, icsText) {
  const feedLabel = extractCalendarLabelFromIcs(icsText);
  const data = {
    lastSyncAt: new Date(),
    lastSyncError: null,
    syncStatus: "idle"
  };
  if (feedLabel) {
    data.label = feedLabel;
  }
  return prisma.calendarSubscription.update({
    where: { id: subscriptionId },
    data
  });
}

function formatEntry(e) {
  const sub = e.subscription || {};
  return {
    id: e.id,
    subscriptionId: e.subscriptionId,
    subscriptionLabel: sub.label || null,
    leagueScopes: Array.isArray(sub.leagueScopes) ? sub.leagueScopes : [],
    icsUid: e.icsUid,
    recurrenceId: e.recurrenceId,
    instanceStartUtc: e.instanceStartUtc.toISOString(),
    dateKeyChicago: e.dateKeyChicago,
    note: e.note,
    status: e.status
  };
}

async function requireSessionUser(req, res) {
  const prisma = getPrisma();
  if (!prisma) {
    res.status(503).json({
      ok: false,
      error: "Database is not configured (DATABASE_URL missing)",
      code: "database_unavailable"
    });
    return null;
  }

  const phpsessid = getSessionFromRequest(req);
  const claimedEmail = getEmailFromRequest(req);
  if (!phpsessid) {
    res.status(400).json({ ok: false, error: "phpsessid is required" });
    return null;
  }
  if (!claimedEmail) {
    res.status(400).json({ ok: false, error: "email is required" });
    return null;
  }

  const session = await verifyTwinRinksSessionAndGetEmail(phpsessid);
  if (!session.ok) {
    res.status(401).json({
      ok: false,
      error: "Legacy session invalid or expired",
      code: session.code || "session_expired"
    });
    return null;
  }
  if (!isEmailClaimValid(session.email, claimedEmail)) {
    res.status(403).json({
      ok: false,
      error: "email does not match Twin Rinks session",
      code: "email_mismatch"
    });
    return null;
  }

  const key = normalizeEmail(session.email);
  let user = await prisma.user.findUnique({ where: { email: key } });
  if (!user) {
    user = await prisma.user.create({ data: { email: key } });
  }

  return { prisma, user, emailKey: key };
}

router.post("/calendar-blocklists", async (req, res) => {
  const ctx = await requireSessionUser(req, res);
  if (!ctx) {
    return;
  }
  const { prisma, user } = ctx;
  const urlRaw = String(req.body?.url || "").trim();
  const mode = String(req.body?.mode || "").trim();
  const leagueScopes = Array.isArray(req.body?.leagueScopes) ? req.body.leagueScopes : [];

  if (!isAllowedCalendarUrl(urlRaw)) {
    return res.status(400).json({
      ok: false,
      code: "invalid_calendar_feed_url",
      error:
        "That URL is not an iCal feed. For Google Calendar use Settings → Integrate calendar → copy Secret address in iCal format (URL contains /calendar/ical/…/basic.ics). Website links with ?cid= won’t work."
    });
  }
  if (mode !== MODE_ALL && mode !== MODE_PICK) {
    return res.status(400).json({ ok: false, error: "mode must be IMPORT_ALL or IMPORT_PICK" });
  }

  const url = normalizeWebcalToHttps(urlRaw);

  let icsText;
  try {
    icsText = await fetchCalendarText(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({
      ok: false,
      error: `Could not fetch calendar feed: ${msg}`
    });
  }

  const label = extractCalendarLabelFromIcs(icsText);

  const sub = await prisma.calendarSubscription.create({
    data: {
      userId: user.id,
      url,
      label,
      mode,
      leagueScopes,
      syncStatus: mode === MODE_ALL ? "syncing" : "idle"
    }
  });

  logInfo("Calendar subscription created", { userId: user.id, subscriptionId: sub.id, mode });

  if (mode === MODE_ALL) {
    setImmediate(() => {
      runSubscriptionSync(prisma, sub.id, { manual: false }).catch(() => {});
    });
  }

  return res.json({ ok: true, subscription: formatSubscription(sub) });
});

router.get("/calendar-blocklists", async (req, res) => {
  const ctx = await requireSessionUser(req, res);
  if (!ctx) {
    return;
  }
  const { prisma, user } = ctx;
  const subs = await prisma.calendarSubscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" }
  });
  return res.json({ ok: true, subscriptions: subs.map(formatSubscription) });
});

router.post("/calendar-blocklists/:id/sync", async (req, res) => {
  const ctx = await requireSessionUser(req, res);
  if (!ctx) {
    return;
  }
  const { prisma, user } = ctx;
  const id = String(req.params.id || "").trim();
  const sub = await prisma.calendarSubscription.findFirst({
    where: { id, userId: user.id }
  });
  if (!sub) {
    return res.status(404).json({ ok: false, error: "Subscription not found" });
  }

  setImmediate(() => {
    runSubscriptionSync(prisma, sub.id, { manual: true }).catch(() => {});
  });

  return res.json({
    ok: true,
    message: "Sync started. Check back in a few minutes.",
    subscriptionId: sub.id
  });
});

router.post("/calendar-blocklists/:id/preview", async (req, res) => {
  const ctx = await requireSessionUser(req, res);
  if (!ctx) {
    return;
  }
  const { prisma, user } = ctx;
  const id = String(req.params.id || "").trim();
  const sub = await prisma.calendarSubscription.findFirst({
    where: { id, userId: user.id, mode: MODE_PICK }
  });
  if (!sub) {
    return res.status(404).json({ ok: false, error: "Pick-mode subscription not found" });
  }
  try {
    const text = await fetchCalendarText(sub.url);
    const { instances, expandError } = await expandIcsToInstances(text, 60);
    if (expandError) {
      return res.status(502).json({
        ok: false,
        error:
          "Could not read events from this calendar. The feed may be invalid or use a recurrence format we cannot parse yet.",
        code: "ics_expand_failed"
      });
    }
    try {
      await recordPickFeedTouch(prisma, sub.id, text);
    } catch (touchErr) {
      logInfo("Could not record pick preview sync metadata", {
        subscriptionId: sub.id,
        err: touchErr instanceof Error ? touchErr.message : String(touchErr)
      });
    }
    return res.json({
      ok: true,
      instances: instances.map((i) => ({
        ...i,
        instanceStartUtc: i.instanceStartUtc.toISOString(),
        key: instanceKey(i)
      }))
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ ok: false, error: msg });
  }
});

router.post("/calendar-blocklists/:id/selections", async (req, res) => {
  const ctx = await requireSessionUser(req, res);
  if (!ctx) {
    return;
  }
  const { prisma, user } = ctx;
  const id = String(req.params.id || "").trim();
  const sub = await prisma.calendarSubscription.findFirst({
    where: { id, userId: user.id, mode: MODE_PICK }
  });
  if (!sub) {
    return res.status(404).json({ ok: false, error: "Pick-mode subscription not found" });
  }

  let keys = req.body?.keys;
  if (!Array.isArray(keys)) {
    return res.status(400).json({ ok: false, error: "keys array required" });
  }
  keys = keys.map((k) => String(k || "").trim()).filter(Boolean);

  let text;
  try {
    text = await fetchCalendarText(sub.url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ ok: false, error: msg });
  }

  const { instances: valid, expandError } = await expandIcsToInstances(text, 60);
  if (expandError) {
    return res.status(502).json({
      ok: false,
      error:
        "Could not read events from this calendar while saving. Try again later or re-add the calendar with a fresh ICS URL.",
      code: "ics_expand_failed"
    });
  }
  const validMap = new Map(valid.map((i) => [instanceKey(i), i]));

  let created = 0;
  try {
    for (const k of keys) {
      const inst = validMap.get(k);
      if (!inst) {
        continue;
      }
      await prisma.calendarBlocklistEntry.upsert({
        where: {
          subscriptionId_icsUid_recurrenceId_instanceStartUtc: {
            subscriptionId: sub.id,
            icsUid: inst.icsUid,
            recurrenceId: inst.recurrenceId || "",
            instanceStartUtc: inst.instanceStartUtc
          }
        },
        create: {
          subscriptionId: sub.id,
          icsUid: inst.icsUid,
          recurrenceId: inst.recurrenceId || "",
          instanceStartUtc: inst.instanceStartUtc,
          dateKeyChicago: inst.dateKeyChicago,
          note: inst.note,
          status: "active"
        },
        update: {
          note: inst.note,
          dateKeyChicago: inst.dateKeyChicago,
          status: "active"
        }
      });
      created += 1;
    }
  } catch (err) {
    if (isPrismaTableMissing(err)) {
      return res.status(503).json(blocklistTableMissingResponseBody());
    }
    throw err;
  }

  try {
    await recordPickFeedTouch(prisma, sub.id, text);
  } catch (touchErr) {
    logInfo("Could not record pick selections sync metadata", {
      subscriptionId: sub.id,
      err: touchErr instanceof Error ? touchErr.message : String(touchErr)
    });
  }

  logInfo("Calendar pick selections saved", { userId: user.id, subscriptionId: sub.id, created });

  return res.json({ ok: true, created });
});

router.delete("/calendar-blocklists/:id", async (req, res) => {
  const ctx = await requireSessionUser(req, res);
  if (!ctx) {
    return;
  }
  const { prisma, user } = ctx;
  const id = String(req.params.id || "").trim();
  const removeBlocklistEntries = Boolean(req.body?.removeBlocklistEntries);

  const sub = await prisma.calendarSubscription.findFirst({
    where: { id, userId: user.id }
  });
  if (!sub) {
    return res.status(404).json({ ok: false, error: "Subscription not found" });
  }

  if (removeBlocklistEntries) {
    try {
      await prisma.calendarBlocklistEntry.deleteMany({ where: { subscriptionId: sub.id } });
    } catch (err) {
      if (err.code !== "P2021") {
        throw err;
      }
      logInfo("CalendarBlocklistEntry table missing; skip deleteMany on disconnect", {
        subscriptionId: sub.id
      });
    }
  }

  await prisma.calendarSubscription.delete({ where: { id: sub.id } });

  logInfo("Calendar subscription removed", { userId: user.id, subscriptionId: id, removeBlocklistEntries });

  return res.json({ ok: true });
});

router.post("/calendar-blocklist-entries/:entryId", async (req, res) => {
  const ctx = await requireSessionUser(req, res);
  if (!ctx) {
    return;
  }
  const { prisma, user } = ctx;
  const entryId = String(req.params.entryId || "").trim();
  const intent = String(req.body?.intent || "").trim();

  let entry;
  try {
    entry = await prisma.calendarBlocklistEntry.findFirst({
      where: { id: entryId },
      include: { subscription: true }
    });
  } catch (err) {
    if (isPrismaTableMissing(err)) {
      return res.status(503).json(blocklistTableMissingResponseBody());
    }
    throw err;
  }
  if (!entry || entry.subscription.userId !== user.id) {
    return res.status(404).json({ ok: false, error: "Entry not found" });
  }

  try {
    if (intent === "mark_deleted") {
      await prisma.calendarBlocklistEntry.update({
        where: { id: entry.id },
        data: { status: "deleted" }
      });
    } else if (intent === "mark_active") {
      await prisma.calendarBlocklistEntry.update({
        where: { id: entry.id },
        data: { status: "active" }
      });
    } else {
      return res.status(400).json({ ok: false, error: "intent must be mark_deleted or mark_active" });
    }

    const updated = await prisma.calendarBlocklistEntry.findUnique({
      where: { id: entry.id },
      include: { subscription: { select: { label: true, leagueScopes: true } } }
    });

    return res.json({ ok: true, entry: formatEntry(updated) });
  } catch (err) {
    if (isPrismaTableMissing(err)) {
      return res.status(503).json(blocklistTableMissingResponseBody());
    }
    throw err;
  }
});

module.exports = router;

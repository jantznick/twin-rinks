"use strict";

const {
  expandIcsToInstances,
  extractCalendarLabelFromIcs,
  fetchCalendarText,
  instanceKey
} = require("./ics-instances");
const { logInfo } = require("./logger");
const {
  INTERNAL_BLOCKLIST_TABLE_MISSING_LOG,
  PUBLIC_CALENDAR_SYNC_UNAVAILABLE,
  isPrismaTableMissing
} = require("./prisma-missing-table");

const MODE_ALL = "IMPORT_ALL";
const MODE_PICK = "IMPORT_PICK";

function keyFromDb(e) {
  return instanceKey({
    icsUid: e.icsUid,
    recurrenceId: e.recurrenceId || "",
    instanceStartUtc: e.instanceStartUtc
  });
}

function feedMapFromInstances(instances) {
  const m = new Map();
  for (const inst of instances) {
    m.set(instanceKey(inst), inst);
  }
  return m;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, mode: string }} subscription
 * @param {boolean} manual
 */
async function reconcileSubscription(prisma, subscription, { manual }) {
  const text = await fetchCalendarText(subscription.url);

  const feedLabel = extractCalendarLabelFromIcs(text);
  if (feedLabel && feedLabel !== subscription.label) {
    await prisma.calendarSubscription.update({
      where: { id: subscription.id },
      data: { label: feedLabel }
    });
    subscription = { ...subscription, label: feedLabel };
  }

  const { instances, expandError } = await expandIcsToInstances(text, 60);
  if (expandError) {
    throw new Error(`Calendar expansion failed: ${expandError}`);
  }
  const feedMap = feedMapFromInstances(instances);

  try {
    const existing = await prisma.calendarBlocklistEntry.findMany({
      where: { subscriptionId: subscription.id }
    });

    for (const e of existing) {
      const k = keyFromDb(e);
      if (!feedMap.has(k)) {
        await prisma.calendarBlocklistEntry.delete({ where: { id: e.id } });
      }
    }

    const afterDelete = await prisma.calendarBlocklistEntry.findMany({
      where: { subscriptionId: subscription.id }
    });
    const byKey = new Map(afterDelete.map((row) => [keyFromDb(row), row]));

    for (const [k, inst] of feedMap) {
      const ex = byKey.get(k);

      if (subscription.mode === MODE_PICK) {
        if (ex) {
          await prisma.calendarBlocklistEntry.update({
            where: { id: ex.id },
            data: {
              note: inst.note ?? ex.note,
              dateKeyChicago: inst.dateKeyChicago
            }
          });
        }
        continue;
      }

      if (!ex) {
        await prisma.calendarBlocklistEntry.create({
          data: {
            subscriptionId: subscription.id,
            icsUid: inst.icsUid,
            recurrenceId: inst.recurrenceId || "",
            instanceStartUtc: inst.instanceStartUtc,
            dateKeyChicago: inst.dateKeyChicago,
            note: inst.note,
            status: "active"
          }
        });
        continue;
      }

      if (ex.status === "active") {
        await prisma.calendarBlocklistEntry.update({
          where: { id: ex.id },
          data: {
            note: inst.note ?? ex.note,
            dateKeyChicago: inst.dateKeyChicago
          }
        });
      } else if (ex.status === "deleted") {
        if (manual) {
          await prisma.calendarBlocklistEntry.update({
            where: { id: ex.id },
            data: {
              status: "purgatory",
              note: inst.note ?? ex.note,
              dateKeyChicago: inst.dateKeyChicago
            }
          });
        }
      } else if (ex.status === "purgatory") {
        await prisma.calendarBlocklistEntry.update({
          where: { id: ex.id },
          data: {
            note: inst.note ?? ex.note,
            dateKeyChicago: inst.dateKeyChicago
          }
        });
      }
    }
  } catch (err) {
    if (isPrismaTableMissing(err)) {
      const e = new Error("BLOCKLIST_TABLE_MISSING");
      e.code = "BLOCKLIST_TABLE_MISSING";
      throw e;
    }
    throw err;
  }
}

async function runSubscriptionSync(prisma, subscriptionId, { manual }) {
  const sub = await prisma.calendarSubscription.findUnique({
    where: { id: subscriptionId }
  });
  if (!sub) {
    return;
  }
  await prisma.calendarSubscription.update({
    where: { id: subscriptionId },
    data: { syncStatus: "syncing", lastSyncError: null }
  });
  try {
    await reconcileSubscription(prisma, sub, { manual });
    await prisma.calendarSubscription.update({
      where: { id: subscriptionId },
      data: {
        syncStatus: "idle",
        lastSyncAt: new Date(),
        lastSyncError: null
      }
    });
  } catch (err) {
    let lastSyncError =
      err instanceof Error ? err.message.slice(0, 2000) : String(err).slice(0, 2000);
    if (isPrismaTableMissing(err) || err.code === "BLOCKLIST_TABLE_MISSING") {
      logInfo("Calendar sync failed: blocklist table missing", {
        subscriptionId,
        detail: INTERNAL_BLOCKLIST_TABLE_MISSING_LOG
      });
      lastSyncError = PUBLIC_CALENDAR_SYNC_UNAVAILABLE;
    }
    await prisma.calendarSubscription.update({
      where: { id: subscriptionId },
      data: {
        syncStatus: "error",
        lastSyncError
      }
    });
  }
}

async function syncAllSubscriptions(prisma) {
  const subs = await prisma.calendarSubscription.findMany({
    where: { mode: MODE_ALL },
    select: { id: true }
  });
  for (const s of subs) {
    await runSubscriptionSync(prisma, s.id, { manual: false });
  }
}

module.exports = {
  MODE_ALL,
  MODE_PICK,
  reconcileSubscription,
  runSubscriptionSync,
  syncAllSubscriptions
};

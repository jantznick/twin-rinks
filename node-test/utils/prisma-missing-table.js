"use strict";

/** Prisma P2021: table does not exist */
function isPrismaTableMissing(err) {
  return Boolean(err && err.code === "P2021");
}

/** Logged server-side only; never sent to browsers. */
const INTERNAL_BLOCKLIST_TABLE_MISSING_LOG =
  "CalendarBlocklistEntry table missing; run npx prisma migrate deploy on the API database";

/** Stored on CalendarSubscription.lastSyncError and returned in APIs — safe for end users. */
const PUBLIC_CALENDAR_SYNC_UNAVAILABLE = "Calendar sync failed. Please try again later.";

function blocklistTableMissingResponseBody() {
  return {
    ok: false,
    code: "calendar_blocklist_table_missing",
    error: PUBLIC_CALENDAR_SYNC_UNAVAILABLE
  };
}

/**
 * Ensures infrastructure / ops details never appear in JSON or UI.
 * Pass through null; otherwise replace known internal messages.
 */
function sanitizeLastSyncErrorForApi(value) {
  if (value == null || String(value).trim() === "") {
    return null;
  }
  const s = String(value);
  const lower = s.toLowerCase();
  if (
    lower.includes("prisma") ||
    lower.includes("migrate deploy") ||
    lower.includes("table does not exist") ||
    lower.includes("calendar blocklist storage") ||
    lower.includes("p2021") ||
    lower.includes("database_url") ||
    lower.includes("postgresql")
  ) {
    return PUBLIC_CALENDAR_SYNC_UNAVAILABLE;
  }
  return s.length > 2000 ? s.slice(0, 2000) : s;
}

module.exports = {
  isPrismaTableMissing,
  blocklistTableMissingResponseBody,
  INTERNAL_BLOCKLIST_TABLE_MISSING_LOG,
  PUBLIC_CALENDAR_SYNC_UNAVAILABLE,
  sanitizeLastSyncErrorForApi
};

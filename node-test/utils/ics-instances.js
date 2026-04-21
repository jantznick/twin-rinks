"use strict";

const ical = require("node-ical");
const { getDateKey } = require("node-ical/lib/date-utils.js");
const { logInfo } = require("./logger");

const CHICAGO = "America/Chicago";

const chicagoDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHICAGO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

/** Wall-calendar date in Chicago (YYYY-MM-DD) for an instant. */
function utcToChicagoDateKey(d) {
  return chicagoDateKeyFormatter.format(new Date(d));
}

function makeInstance({ icsUid, recurrenceId, instanceStartUtc, note }) {
  const start = instanceStartUtc instanceof Date ? instanceStartUtc : new Date(instanceStartUtc);
  return {
    icsUid: String(icsUid || "").trim() || "unknown",
    recurrenceId: recurrenceId ? String(recurrenceId) : "",
    instanceStartUtc: start,
    dateKeyChicago: utcToChicagoDateKey(start),
    note: note != null && String(note).trim().length > 0 ? String(note).trim().slice(0, 500) : null
  };
}

function instanceKey(inst) {
  const iso = new Date(inst.instanceStartUtc).toISOString();
  return `${inst.icsUid}\t${inst.recurrenceId || ""}\t${iso}`;
}

function isExcludedByExdate(ev, occurrenceStart) {
  const ex = ev.exdate;
  if (!ex || typeof ex !== "object") {
    return false;
  }
  const iso = occurrenceStart.toISOString();
  if (ex[iso]) {
    return true;
  }
  try {
    const dk = getDateKey(occurrenceStart);
    return Boolean(ex[dk]);
  } catch {
    return false;
  }
}

function findRecurrenceOverride(ev, occurrenceStart) {
  const r = ev.recurrences;
  if (!r || typeof r !== "object") {
    return null;
  }
  const iso = occurrenceStart.toISOString();
  if (r[iso]) {
    return r[iso];
  }
  try {
    const dk = getDateKey(occurrenceStart);
    return r[dk] || null;
  } catch {
    return null;
  }
}

function recurrenceIdForInstance(override) {
  if (!override || !override.recurrenceid) {
    return "";
  }
  const rid = override.recurrenceid;
  return rid instanceof Date ? rid.toISOString() : String(rid);
}

/** Same overlap window as ical-expander: [windowStart, windowEnd] intersects [evStart, evEnd]. */
function eventOverlapsWindow(evStartMs, evEndMs, windowStart, windowEnd) {
  return evEndMs >= windowStart.getTime() && evStartMs <= windowEnd.getTime();
}

function expandOneVevent(ev, windowStart, windowEnd, map) {
  if (!ev || ev.type !== "VEVENT" || !ev.uid) {
    return;
  }

  const uid = ev.uid;

  if (ev.rrule) {
    let starts;
    try {
      starts = ev.rrule.between(windowStart, windowEnd, true);
    } catch (err) {
      logInfo("ICS rrule.between failed", { uid, err: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!Array.isArray(starts) || starts.length === 0) {
      return;
    }

    const baseDur =
      ev.start && ev.end && !Number.isNaN(ev.end - ev.start) ? ev.end - ev.start : 60 * 60 * 1000;

    for (const occStart of starts) {
      if (!(occStart instanceof Date) || Number.isNaN(occStart.getTime())) {
        continue;
      }
      if (isExcludedByExdate(ev, occStart)) {
        continue;
      }

      const override = findRecurrenceOverride(ev, occStart);
      let startJs;
      let endJs;
      let note;

      if (override && override.start) {
        startJs = override.start instanceof Date ? override.start : new Date(override.start);
        endJs = override.end
          ? override.end instanceof Date
            ? override.end
            : new Date(override.end)
          : new Date(startJs.getTime() + baseDur);
        note = override.summary != null ? override.summary : ev.summary;
      } else {
        startJs = occStart;
        endJs = new Date(occStart.getTime() + baseDur);
        note = ev.summary;
      }

      if (!Number.isFinite(startJs.getTime()) || !Number.isFinite(endJs.getTime())) {
        continue;
      }

      if (!eventOverlapsWindow(startJs.getTime(), endJs.getTime(), windowStart, windowEnd)) {
        continue;
      }

      const rid = recurrenceIdForInstance(override);
      const inst = makeInstance({
        icsUid: uid,
        recurrenceId: rid,
        instanceStartUtc: startJs,
        note
      });
      map.set(instanceKey(inst), inst);
    }
    return;
  }

  /* Non-recurring */
  if (!ev.start) {
    return;
  }
  const evStart = ev.start instanceof Date ? ev.start : new Date(ev.start);
  if (Number.isNaN(evStart.getTime())) {
    return;
  }
  const evEnd = ev.end
    ? ev.end instanceof Date
      ? ev.end
      : new Date(ev.end)
    : new Date(evStart.getTime() + 60 * 60 * 1000);
  if (!eventOverlapsWindow(evStart.getTime(), evEnd.getTime(), windowStart, windowEnd)) {
    return;
  }

  const rid = ev.recurrenceid
    ? ev.recurrenceid instanceof Date
      ? ev.recurrenceid.toISOString()
      : String(ev.recurrenceid)
    : "";

  const inst = makeInstance({
    icsUid: uid,
    recurrenceId: rid,
    instanceStartUtc: evStart,
    note: ev.summary
  });
  map.set(instanceKey(inst), inst);
}

/**
 * Fetch ICS text over HTTPS.
 */
async function fetchCalendarText(urlStr) {
  const { normalizeWebcalToHttps } = require("./calendar-url");
  const url = normalizeWebcalToHttps(urlStr);
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "TwinRinksCalendarSync/1.0",
      Accept: "text/calendar, application/octet-stream, */*"
    }
  });
  if (!res.ok) {
    throw new Error(`Calendar fetch failed: HTTP ${res.status}`);
  }
  const text = await res.text();
  if (text.length > 5_000_000) {
    throw new Error("Calendar response too large");
  }
  return text;
}

/**
 * Expand ICS to instances in [now, now+daysAhead], de-duplicated by instance key.
 * Uses node-ical (RRULE expansion, EXDATE, RECURRENCE-ID) — no vendored ical-expander.
 */
async function expandIcsToInstances(icsText, daysAhead = 60) {
  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + daysAhead * 86400000);

  let data;
  try {
    data = await ical.async.parseICS(icsText);
  } catch (err) {
    const expandError = err instanceof Error ? err.message : String(err);
    logInfo("ICS parse failed", { expandError });
    return { instances: [], expandError };
  }

  const map = new Map();

  for (const [key, ev] of Object.entries(data)) {
    if (key === "vcalendar" || ev.type !== "VEVENT") {
      continue;
    }
    try {
      expandOneVevent(ev, windowStart, windowEnd, map);
    } catch (err) {
      logInfo("ICS event skipped", {
        uid: ev && ev.uid,
        err: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return { instances: Array.from(map.values()), expandError: null };
}

/**
 * Calendar display name from ICS (Google: X-WR-CALNAME). Unfolds folded lines; trims length.
 */
function extractCalendarLabelFromIcs(icsText) {
  if (!icsText || typeof icsText !== "string") {
    return null;
  }
  const unfolded = icsText.replace(/\r\n/g, "\n").replace(/\n[\t ]/g, "");
  const m = unfolded.match(/X-WR-CALNAME:([^\n]+)/i);
  if (!m) {
    return null;
  }
  let raw = m[1].trim();
  raw = raw.replace(/\\N/gi, "\n").replace(/\\([,;\\])/g, "$1");
  const s = raw.slice(0, 200).trim();
  return s || null;
}

module.exports = {
  expandIcsToInstances,
  fetchCalendarText,
  extractCalendarLabelFromIcs,
  instanceKey,
  utcToChicagoDateKey
};

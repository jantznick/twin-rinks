"use strict";

/**
 * MVP: allow Google Calendar feeds and typical iCal (.ics / /ical/) HTTPS URLs.
 */
function normalizeWebcalToHttps(urlStr) {
  const s = String(urlStr || "").trim();
  if (s.toLowerCase().startsWith("webcal://")) {
    return `https://${s.slice("webcal://".length)}`;
  }
  return s;
}

/** Same rules as frontend `validateCalendarFeedUrl` — Google web UI URLs are not ICS feeds. */
function isAllowedCalendarUrl(urlStr) {
  let u;
  try {
    u = new URL(normalizeWebcalToHttps(urlStr));
  } catch {
    return false;
  }
  if (u.protocol !== "https:") {
    return false;
  }
  const host = u.hostname.toLowerCase();
  const pathLower = u.pathname.toLowerCase();

  if (host === "calendar.google.com") {
    const looksLikeWebUi =
      pathLower.includes("/calendar/u/") ||
      pathLower.includes("/calendar/embed") ||
      pathLower.includes("/calendar/r/") ||
      u.searchParams.has("cid") ||
      u.searchParams.has("src");

    if (looksLikeWebUi || !pathLower.includes("/calendar/ical/")) {
      return false;
    }
    if (!pathLower.includes(".ics")) {
      return false;
    }
    return true;
  }

  const path = `${u.pathname}${u.search}`.toLowerCase();
  if (path.includes(".ics") || path.includes("/ical")) {
    return true;
  }
  return false;
}

module.exports = {
  normalizeWebcalToHttps,
  isAllowedCalendarUrl
};

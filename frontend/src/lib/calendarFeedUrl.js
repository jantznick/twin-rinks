/**
 * Validate a URL meant for ICS subscription (Twin Rinks imported calendars).
 * Google Calendar website / sharing links are not feeds — users need
 * Settings → Integrate calendar → "Secret address in iCal format" (or public iCal URL).
 */

function normalizeWebcal(urlStr) {
  const s = String(urlStr || "").trim();
  if (s.toLowerCase().startsWith("webcal://")) {
    return `https://${s.slice("webcal://".length)}`;
  }
  return s;
}

/**
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateCalendarFeedUrl(urlStr) {
  const raw = String(urlStr || "").trim();
  if (!raw) {
    return { ok: false, message: "Paste a calendar URL." };
  }

  let u;
  try {
    u = new URL(normalizeWebcal(raw));
  } catch {
    return {
      ok: false,
      message: "That doesn’t look like a valid URL. Copy the full iCal / .ics link."
    };
  }

  if (u.protocol !== "https:") {
    return {
      ok: false,
      message: "Use an https:// link (or webcal://, which we convert to https)."
    };
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
      return {
        ok: false,
        message:
          "That’s a Google Calendar website link, not a feed. In Google Calendar: open the calendar’s settings → Integrate calendar → copy Secret address in iCal format (or the public iCal URL). It must look like …/calendar/ical/…/basic.ics"
      };
    }

    if (!pathLower.includes(".ics")) {
      return {
        ok: false,
        message:
          "Google feed URLs end in basic.ics. Use Integrate calendar → Secret address in iCal format."
      };
    }

    return { ok: true };
  }

  const pathAndQuery = `${u.pathname}${u.search}`.toLowerCase();
  if (pathAndQuery.includes(".ics") || pathAndQuery.includes("/ical")) {
    return { ok: true };
  }

  return {
    ok: false,
    message:
      "Use a direct iCal (.ics) HTTPS URL — often shown as “Subscribe” / “iCal” / “Export” in your calendar app, not the normal browser page."
  };
}

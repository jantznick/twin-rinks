/**
 * SportsEngine calendars: user-defined labels are stored in Postgres via the API.
 */

export function normalizeCalendarUrlInput(raw) {
  let s = String(raw ?? "").trim();
  if (!s) {
    return "";
  }
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

export function shortUrlKey(urlOrId) {
  const s = String(urlOrId || "");
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return `k${(h >>> 0).toString(36)}`;
}

/** UUID v4 (matches server-assigned `scheduleId` from saved settings). */
export function isScheduleId(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s ?? "").trim()
  );
}

/** Normalize one calendar entry from API or legacy shapes. */
export function normalizeCalendarEntry(raw) {
  if (typeof raw === "string") {
    const url = String(raw).trim();
    if (!url) {
      return null;
    }
    return {
      scheduleId: "",
      url,
      leagueLabel: "League schedule"
    };
  }
  if (raw && typeof raw === "object") {
    const url = String(raw.url ?? "").trim();
    if (!url) {
      return null;
    }
    return {
      scheduleId: String(raw.scheduleId ?? "").trim(),
      url,
      leagueLabel: String(raw.leagueLabel ?? "").trim() || "League schedule"
    };
  }
  return null;
}

export function normalizeCalendarsPayload(data) {
  if (data?.sportsengineCalendars && Array.isArray(data.sportsengineCalendars)) {
    return data.sportsengineCalendars.map(normalizeCalendarEntry).filter(Boolean);
  }
  if (Array.isArray(data?.sportsengineCalendarUrls)) {
    return data.sportsengineCalendarUrls.map(normalizeCalendarEntry).filter(Boolean);
  }
  return [];
}

export async function loadSportsengineCalendarsFromApi(apiBase, phpsessid, email) {
  const response = await fetch(`${apiBase}/user/sportsengine-calendars`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phpsessid, email: String(email || "").trim() })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    const err = new Error(data.error || "Failed to load calendar settings");
    err.code = data.code;
    throw err;
  }
  return normalizeCalendarsPayload(data);
}

export async function saveSportsengineCalendarsToApi(apiBase, phpsessid, email, calendars) {
  const response = await fetch(`${apiBase}/user/sportsengine-calendars`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phpsessid,
      email: String(email || "").trim(),
      sportsengineCalendars: calendars
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    const err = new Error(data.error || "Failed to save calendar settings");
    err.code = data.code;
    throw err;
  }
  return normalizeCalendarsPayload(data);
}

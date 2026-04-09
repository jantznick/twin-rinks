/**
 * Helpers for SportsEngine team schedule URLs (merged into My Games & Subs).
 * Canonical storage is the API + PostgreSQL (`User.sportsengineCalendarUrls`), not localStorage.
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

export function shortUrlKey(url) {
  const s = String(url || "");
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return `k${(h >>> 0).toString(36)}`;
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
  return Array.isArray(data.sportsengineCalendarUrls)
    ? data.sportsengineCalendarUrls
    : [];
}

export async function saveSportsengineCalendarsToApi(apiBase, phpsessid, email, urls) {
  const response = await fetch(`${apiBase}/user/sportsengine-calendars`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phpsessid,
      email: String(email || "").trim(),
      sportsengineCalendarUrls: urls
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    const err = new Error(data.error || "Failed to save calendar settings");
    err.code = data.code;
    throw err;
  }
  return Array.isArray(data.sportsengineCalendarUrls)
    ? data.sportsengineCalendarUrls
    : urls;
}

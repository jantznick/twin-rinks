"use strict";

/**
 * SportsEngine schedule tables print dates without a year ("Thu Apr 9").
 * This module recovers the real year from other signals on the same page:
 * the upcoming-games slider (`slider_day_YYYY_M_D`), the season label
 * ("2026 Spring/Summer"), the chronological ordering of the table, and the
 * weekday abbreviation in the cell itself.
 */

const MONTH_INDEX_BY_ABBREV = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

const WEEKDAY_INDEX_BY_ABBREV = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
};

/**
 * A single season may wrap Dec→Jan once. More descents than this means the
 * table is not sorted chronologically, so sequential year assignment is unsafe.
 */
const MAX_EXPECTED_YEAR_WRAPS = 2;

/** Parses "Thu Apr 9" / "Apr 9" into weekday+month+day. Weekday is optional. */
function parseDateRawParts(dateRaw) {
  const cleaned = String(dateRaw || "").replace(/\s+/g, " ").trim();
  const match = cleaned.match(
    /^(?:([A-Za-z]{3,9})\.?,?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/
  );
  if (!match) {
    return null;
  }
  const monthKey = match[2].slice(0, 3).toLowerCase();
  if (!(monthKey in MONTH_INDEX_BY_ABBREV)) {
    return null;
  }
  const day = Number(match[3]);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }
  const weekdayKey = match[1] ? match[1].slice(0, 3).toLowerCase() : "";
  const weekday = weekdayKey in WEEKDAY_INDEX_BY_ABBREV
    ? WEEKDAY_INDEX_BY_ABBREV[weekdayKey]
    : null;
  return { weekday, month: MONTH_INDEX_BY_ABBREV[monthKey], day };
}

/** Month/day as a sortable number, so Apr 9 < Dec 5 regardless of year. */
function ordinalOf(parts) {
  return parts.month * 100 + parts.day;
}

/** Returns null for impossible dates (Feb 30) instead of silently rolling over. */
function buildDate(year, parts) {
  const date = new Date(year, parts.month, parts.day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== parts.month ||
    date.getDate() !== parts.day
  ) {
    return null;
  }
  return date;
}

function formatIsoDate(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayAgrees(date, parts) {
  return parts.weekday === null || date.getDay() === parts.weekday;
}

/** First candidate year whose weekday matches the scraped cell, if any. */
function pickYearByWeekday(parts, candidateYears) {
  if (parts.weekday === null) {
    return null;
  }
  for (const year of candidateYears) {
    const date = buildDate(year, parts);
    if (date && weekdayAgrees(date, parts)) {
      return date;
    }
  }
  return null;
}

/**
 * Maps game id → calendar date using the upcoming-games slider, whose list item
 * ids carry the full year. Only covers games shown in the slider.
 */
function parseSliderDateAnchors(html) {
  const anchors = new Map();
  const itemRegex =
    /<li\b[^>]*\bid=["']slider_day_(\d{4})_(\d{1,2})_(\d{1,2})["'][^>]*>([\s\S]*?)<\/li>/gi;
  let itemMatch = itemRegex.exec(html);

  while (itemMatch) {
    const year = Number(itemMatch[1]);
    const month = Number(itemMatch[2]) - 1;
    const day = Number(itemMatch[3]);
    const body = itemMatch[4];

    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const gameIdRegex = /\/game\/show\/(\d+)/gi;
      let gameIdMatch = gameIdRegex.exec(body);
      while (gameIdMatch) {
        const gameId = gameIdMatch[1];
        if (!anchors.has(gameId)) {
          anchors.set(gameId, { year, month, day });
        }
        gameIdMatch = gameIdRegex.exec(body);
      }
    }

    itemMatch = itemRegex.exec(html);
  }

  return anchors;
}

/**
 * Years mentioned by the season chrome, e.g. "2026 Spring/Summer" or
 * "2025-26 Fall/Winter". Used to seed schedules with no slider coverage.
 */
function parseSeasonYears(html) {
  const source = String(html || "");
  const labels = [];

  const spanRegex =
    /<span\b[^>]*class=["'][^"']*\b(?:season|season-title|subseason)\b[^"']*["'][^>]*>([\s\S]{0,300}?)<\/span>/gi;
  let spanMatch = spanRegex.exec(source);
  while (spanMatch) {
    labels.push(spanMatch[1]);
    spanMatch = spanRegex.exec(source);
  }

  const titleMatch = source.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  if (titleMatch) {
    labels.push(titleMatch[1]);
  }

  const years = new Set();
  for (const label of labels) {
    const text = label.replace(/<[^>]+>/g, " ");
    const rangeRegex = /\b((?:19|20)\d{2})\s*[-/–]\s*(\d{2})\b/g;
    let rangeMatch = rangeRegex.exec(text);
    while (rangeMatch) {
      const startYear = Number(rangeMatch[1]);
      years.add(startYear);
      years.add(Number(String(startYear).slice(0, 2) + rangeMatch[2]));
      rangeMatch = rangeRegex.exec(text);
    }

    const yearRegex = /\b((?:19|20)\d{2})\b/g;
    let yearMatch = yearRegex.exec(text);
    while (yearMatch) {
      years.add(Number(yearMatch[1]));
      yearMatch = yearRegex.exec(text);
    }
  }

  return [...years].sort((a, b) => a - b);
}

/**
 * Plausible years for a schedule with no anchors, closest to `now` first.
 * A season labelled with one year can still run into the next one.
 */
function seedCandidateYears(parts, seasonYears, now) {
  const candidates = new Set();
  for (const seasonYear of seasonYears) {
    candidates.add(seasonYear);
    candidates.add(seasonYear + 1);
  }
  const nowYear = now.getFullYear();
  candidates.add(nowYear - 1);
  candidates.add(nowYear);
  candidates.add(nowYear + 1);

  return [...candidates].sort((a, b) => {
    const dateA = buildDate(a, parts);
    const dateB = buildDate(b, parts);
    if (!dateA || !dateB) {
      return dateA ? -1 : 1;
    }
    return (
      Math.abs(dateA.getTime() - now.getTime()) -
      Math.abs(dateB.getTime() - now.getTime())
    );
  });
}

function assignEntryDate(entry, date, source) {
  entry.date = date;
  entry.yearSource = source;
  entry.confidence =
    source === "slider" ? "exact" : weekdayAgrees(date, entry.parts) ? "high" : "low";
}

/** Number of times the month/day ordering goes backwards across the table. */
function countOrdinalDescents(entries) {
  let descents = 0;
  for (let i = 1; i < entries.length; i += 1) {
    if (ordinalOf(entries[i].parts) < ordinalOf(entries[i - 1].parts)) {
      descents += 1;
    }
  }
  return descents;
}

/** Walks outward from known dates, rolling the year at each Dec→Jan wrap. */
function resolveBySequence(entries, seasonYears, now) {
  let seedIndex = entries.findIndex((entry) => entry.date);

  if (seedIndex === -1) {
    seedIndex = 0;
    const seed = entries[0];
    const candidates = seedCandidateYears(seed.parts, seasonYears, now);
    const byWeekday = pickYearByWeekday(seed.parts, candidates);
    const fallback = candidates
      .map((year) => buildDate(year, seed.parts))
      .find(Boolean);
    if (byWeekday || fallback) {
      assignEntryDate(seed, byWeekday || fallback, byWeekday ? "weekday" : "season");
    }
  }

  for (let i = seedIndex + 1; i < entries.length; i += 1) {
    if (!entries[i].date && entries[i - 1].date) {
      assignRelativeToNeighbor(entries[i], entries[i - 1], 1);
    }
  }

  for (let i = seedIndex - 1; i >= 0; i -= 1) {
    if (!entries[i].date && entries[i + 1].date) {
      assignRelativeToNeighbor(entries[i], entries[i + 1], -1);
    }
  }
}

/**
 * Dates an entry from an already-dated neighbour. `direction` is 1 when the
 * neighbour comes earlier in the table, -1 when it comes later.
 */
function assignRelativeToNeighbor(entry, neighbor, direction) {
  const entryOrdinal = ordinalOf(entry.parts);
  const neighborOrdinal = ordinalOf(neighbor.parts);
  const neighborYear = neighbor.date.getFullYear();

  let baseYear = neighborYear;
  if (direction === 1 && entryOrdinal < neighborOrdinal) {
    baseYear += 1;
  } else if (direction === -1 && entryOrdinal > neighborOrdinal) {
    baseYear -= 1;
  }

  const candidates =
    direction === 1 ? [baseYear, baseYear + 1] : [baseYear, baseYear - 1];
  const byWeekday = pickYearByWeekday(entry.parts, candidates);
  const date = byWeekday || buildDate(baseYear, entry.parts);
  if (date) {
    assignEntryDate(entry, date, byWeekday ? "weekday" : "sequence");
  }
}

/** Fallback for tables that are not in date order: judge each row on its own. */
function resolveIndependently(entries, seasonYears, now) {
  const reference = entries.find((entry) => entry.date)?.date || now;
  for (const entry of entries) {
    if (entry.date) {
      continue;
    }
    const candidates = seedCandidateYears(entry.parts, seasonYears, reference);
    const byWeekday = pickYearByWeekday(entry.parts, candidates);
    const fallback = candidates
      .map((year) => buildDate(year, entry.parts))
      .find(Boolean);
    const date = byWeekday || fallback;
    if (date) {
      assignEntryDate(entry, date, byWeekday ? "weekday" : "season");
    }
  }
}

/**
 * Adds `dateIso` (YYYY-MM-DD) plus provenance fields to parsed schedule games.
 * Games whose date cell cannot be parsed are returned unchanged.
 * @param {Array<{gameId: string, dateRaw: string}>} games in table order
 * @param {{sliderAnchors?: Map, seasonYears?: number[], now?: Date}} [options]
 */
function resolveScheduleGameDates(games, options = {}) {
  if (!Array.isArray(games) || games.length === 0) {
    return [];
  }

  const sliderAnchors =
    options.sliderAnchors instanceof Map ? options.sliderAnchors : new Map();
  const seasonYears = Array.isArray(options.seasonYears) ? options.seasonYears : [];
  const now = options.now instanceof Date ? options.now : new Date();

  const entries = games.map((game) => ({
    game,
    parts: parseDateRawParts(game.dateRaw),
    date: null,
    yearSource: "",
    confidence: ""
  }));

  for (const entry of entries) {
    if (!entry.parts) {
      continue;
    }
    const anchor = sliderAnchors.get(String(entry.game.gameId));
    // Only trust the slider when it agrees with the table cell it should describe.
    if (
      !anchor ||
      anchor.month !== entry.parts.month ||
      anchor.day !== entry.parts.day
    ) {
      continue;
    }
    const date = buildDate(anchor.year, entry.parts);
    if (date) {
      assignEntryDate(entry, date, "slider");
    }
  }

  const datedEntries = entries.filter((entry) => entry.parts);
  if (datedEntries.length > 0) {
    if (countOrdinalDescents(datedEntries) > MAX_EXPECTED_YEAR_WRAPS) {
      resolveIndependently(datedEntries, seasonYears, now);
    } else {
      resolveBySequence(datedEntries, seasonYears, now);
    }
  }

  return entries.map((entry) =>
    entry.date
      ? {
          ...entry.game,
          dateIso: formatIsoDate(entry.date),
          dateYearSource: entry.yearSource,
          dateConfidence: entry.confidence
        }
      : entry.game
  );
}

module.exports = {
  parseDateRawParts,
  parseSliderDateAnchors,
  parseSeasonYears,
  resolveScheduleGameDates
};

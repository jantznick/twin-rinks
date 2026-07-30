"use strict";

const fs = require("fs");
const path = require("path");
const { parseSportsengineTeamScheduleHtml } = require("./sportsengine-schedule-parser");
const { resolveScheduleGameDates } = require("./sportsengine-date-resolver");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    console.log(`        expected: ${JSON.stringify(expected)}`);
    console.log(`        actual:   ${JSON.stringify(actual)}`);
  }
}

function isoDates(games) {
  return games.map((g) => g.dateIso || null);
}

/** Resolves bare date cells with no slider coverage, as if scraped in table order. */
function resolveRaw(dateRaws, options) {
  const games = dateRaws.map((dateRaw, i) => ({ gameId: String(i + 1), dateRaw }));
  return resolveScheduleGameDates(games, options);
}

function checkSampleFile() {
  const samplePath = path.resolve(__dirname, "../sport_engine.html");
  if (!fs.existsSync(samplePath)) {
    console.log("SKIP  sample sport_engine.html not found");
    return;
  }
  const parsed = parseSportsengineTeamScheduleHtml(fs.readFileSync(samplePath, "utf8"));

  check("sample: season years parsed", parsed.seasonYears, [2026]);
  check("sample: dates resolved from slider", isoDates(parsed.games), [
    "2026-04-09",
    "2026-04-15",
    "2026-04-23"
  ]);
  check(
    "sample: slider dates marked authoritative",
    parsed.games.map((g) => g.dateYearSource),
    ["slider", "slider", "slider"]
  );
}

function checkFallWinterWrap() {
  // Season spans two calendar years and the slider covers none of the games.
  const games = resolveRaw(
    ["Fri Nov 7", "Sun Dec 21", "Sat Jan 3", "Thu Jan 29", "Wed Feb 11"],
    { seasonYears: [2025, 2026], now: new Date(2025, 10, 1) }
  );
  check("fall/winter: rolls year at Dec to Jan wrap", isoDates(games), [
    "2025-11-07",
    "2025-12-21",
    "2026-01-03",
    "2026-01-29",
    "2026-02-11"
  ]);
}

function checkPastGamesNotPushedForward() {
  // The old heuristic remapped finished spring games into the following year.
  const games = resolveRaw(["Thu Apr 9", "Wed Apr 15", "Thu Apr 23"], {
    seasonYears: [2026],
    now: new Date(2026, 6, 30)
  });
  check("finished season: keeps games in the past", isoDates(games), [
    "2026-04-09",
    "2026-04-15",
    "2026-04-23"
  ]);
}

function checkWeekdayDisambiguation() {
  // Dec 5 is a Friday in 2025 and a Saturday in 2026; the weekday decides.
  const friday = resolveRaw(["Fri Dec 5"], { seasonYears: [], now: new Date(2026, 0, 15) });
  check("weekday: picks the year matching the cell", isoDates(friday), ["2025-12-05"]);

  const saturday = resolveRaw(["Sat Dec 5"], { seasonYears: [], now: new Date(2026, 0, 15) });
  check("weekday: distinguishes adjacent years", isoDates(saturday), ["2026-12-05"]);
}

function checkSliderAnchorsSeedUndatedRows() {
  // Only the upcoming games appear in the slider; earlier rows anchor off them.
  const anchors = new Map([["3", { year: 2026, month: 0, day: 8 }]]);
  const games = [
    { gameId: "1", dateRaw: "Sat Dec 20" },
    { gameId: "2", dateRaw: "Mon Dec 29" },
    { gameId: "3", dateRaw: "Thu Jan 8" },
    { gameId: "4", dateRaw: "Fri Jan 16" }
  ];
  const resolved = resolveScheduleGameDates(games, {
    sliderAnchors: anchors,
    seasonYears: [],
    now: new Date(2026, 0, 5)
  });
  check("slider anchor: back-fills earlier rows into prior year", isoDates(resolved), [
    "2025-12-20",
    "2025-12-29",
    "2026-01-08",
    "2026-01-16"
  ]);
}

function checkUnparsableRowsSurvive() {
  const games = resolveScheduleGameDates([{ gameId: "1", dateRaw: "TBD" }], {
    now: new Date(2026, 3, 1)
  });
  check("unparsable cell: row kept without dateIso", isoDates(games), [null]);
  check("unparsable cell: original fields preserved", games[0].dateRaw, "TBD");
}

function main() {
  checkSampleFile();
  checkFallWinterWrap();
  checkPastGamesNotPushedForward();
  checkWeekdayDisambiguation();
  checkSliderAnchorsSeedUndatedRows();
  checkUnparsableRowsSurvive();

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();

#!/usr/bin/env node
/**
 * Smoke-test an ICS feed the same way the API does (fetch + expandIcsToInstances).
 *
 * Usage:
 *   node scripts/fetch-ics-smoke.js "https://calendar.google.com/calendar/ical/.../basic.ics"
 *
 * Or:
 *   ICS_URL="https://..." node scripts/fetch-ics-smoke.js
 *
 * Run from the node-test directory (or any cwd — paths are resolved relative to this file).
 */

"use strict";

const path = require("path");

const root = path.join(__dirname, "..");
process.chdir(root);

const { fetchCalendarText, expandIcsToInstances } = require(path.join(root, "utils", "ics-instances"));

function ensureHttps(urlStr) {
  const s = String(urlStr || "").trim();
  if (!s) {
    return "";
  }
  if (/^https?:\/\//i.test(s)) {
    return s;
  }
  return `https://${s.replace(/^\/+/, "")}`;
}

async function main() {
  const raw = process.argv[2] || process.env.ICS_URL || "";
  const url = ensureHttps(raw);
  if (!url) {
    console.error("Pass an ICS URL as the first argument, or set ICS_URL.");
    console.error(
      'Example: node scripts/fetch-ics-smoke.js "https://calendar.google.com/calendar/ical/…/basic.ics"'
    );
    process.exit(1);
  }

  console.log("URL:", url);
  console.log("Fetching…");

  let text;
  try {
    text = await fetchCalendarText(url);
  } catch (e) {
    console.error("Fetch failed:", e && e.message ? e.message : e);
    process.exit(2);
  }

  console.log("Bytes:", text.length);
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    console.error("Response does not look like ICS (no BEGIN:VCALENDAR). First 400 chars:");
    console.error(text.slice(0, 400));
    process.exit(3);
  }

  console.log("Expanding (next 60 days, same as API)…");
  const { instances, expandError } = await expandIcsToInstances(text, 60);

  if (expandError) {
    console.error("expandIcsToInstances error:", expandError);
    process.exit(4);
  }

  console.log("Instance count:", instances.length);
  const sample = instances.slice(0, 15);
  for (const inst of sample) {
    console.log(
      " -",
      inst.dateKeyChicago,
      inst.instanceStartUtc.toISOString(),
      inst.note || "(no title)"
    );
  }
  if (instances.length > sample.length) {
    console.log(` … and ${instances.length - sample.length} more`);
  }

  if (instances.length === 0) {
    console.log(
      "(Zero instances can mean no events in the next 60 days, or a parser edge case — check the feed in a calendar app.)"
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});

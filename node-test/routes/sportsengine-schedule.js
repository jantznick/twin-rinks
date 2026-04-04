"use strict";

const {
  parseSportsengineTeamScheduleHtml
} = require("../sportsengine-schedule-parser");
const { logInfo } = require("../utils/logger");
const {
  headersToObject,
  buildBodyPreview
} = require("../utils/http");
const { resolveRosemontTeamScheduleFetchUrl } = require("../utils/rosemont-schedule-url");

function registerSportsengineScheduleRoutes(app) {
  app.get("/sportsengine/team-schedule", async (req, res) => {
    const rawUrl = req.query?.url;
    const resolved = resolveRosemontTeamScheduleFetchUrl(rawUrl);
    if (resolved.error) {
      return res.status(400).json({
        ok: false,
        error: resolved.error,
        code: "sportsengine_schedule_url_invalid"
      });
    }

    const scheduleUrl = resolved.url;
    try {
      logInfo("SportsEngine team schedule request", { url: scheduleUrl });
      const response = await fetch(scheduleUrl, {
        method: "GET",
        redirect: "follow"
      });
      const html = await response.text();
      const bodyPreview = buildBodyPreview(html);
      const responseHeaders = headersToObject(response.headers);

      logInfo("SportsEngine team schedule response received", {
        status: response.status,
        headers: responseHeaders,
        bodyPreview
      });

      if (response.status >= 400) {
        return res.status(502).json({
          ok: false,
          error: `Schedule page request failed with status ${response.status}`,
          code: "sportsengine_schedule_fetch_failed"
        });
      }

      const parsed = parseSportsengineTeamScheduleHtml(html);
      if (parsed.gameCount === 0) {
        logInfo("SportsEngine schedule table missing or empty", {
          responseLength: html.length,
          bodyPreview
        });
        return res.status(422).json({
          ok: false,
          error: "Schedule table not found or no games parsed",
          code: "sportsengine_schedule_parse_failed",
          hint: "Page layout may have changed"
        });
      }

      logInfo("SportsEngine team schedule parsed", {
        gameCount: parsed.gameCount,
        teamName: parsed.teamName || null,
        parserVersion: parsed.parserVersion
      });

      return res.json({
        ok: true,
        sourceUrl: scheduleUrl,
        teamName: parsed.teamName || null,
        gameCount: parsed.gameCount,
        parserVersion: parsed.parserVersion,
        games: parsed.games
      });
    } catch (error) {
      logInfo("SportsEngine team schedule request failed", {
        error: error.message
      });
      return res.status(502).json({
        ok: false,
        error: "SportsEngine team schedule request failed",
        details: error.message
      });
    }
  });
}

module.exports = registerSportsengineScheduleRoutes;

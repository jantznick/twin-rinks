"use strict";

require("./ensure-prisma");

const express = require("express");
const cors = require("cors");
const {
  PORT,
  FRONTEND_URL,
  LEGACY_BASE_URL,
  LEGACY_LOGIN_PATH,
  LEGACY_GAMES_PATH,
  LOG_SENSITIVE
} = require("./config");
const { logInfo } = require("./utils/logger");
const sportsengineScheduleRoutes = require("./routes/sportsengine-schedule");
const userSettingsRoutes = require("./routes/user-settings");
const blackoutsRoutes = require("./routes/blackouts");
const calendarBlocklistsRoutes = require("./routes/calendar-blocklists");
const legacyRoutes = require("./routes/legacy");
const { getPrisma } = require("./lib/prisma");
const { syncAllSubscriptions } = require("./utils/calendar-sync");

const app = express();

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    logInfo(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`);
  });
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/sportsengine", sportsengineScheduleRoutes);
app.use("/user", userSettingsRoutes);
app.use("/user", blackoutsRoutes);
app.use("/user", calendarBlocklistsRoutes);
app.use(legacyRoutes);

const TWELVE_H_MS = 12 * 60 * 60 * 1000;
setInterval(() => {
  const prisma = getPrisma();
  if (prisma) {
    syncAllSubscriptions(prisma).catch(() => {});
  }
}, TWELVE_H_MS);

app.listen(PORT, () => {
  logInfo(`Legacy middleware listening on http://localhost:${PORT}`, {
    legacyBaseUrl: LEGACY_BASE_URL,
    legacyLoginPath: LEGACY_LOGIN_PATH,
    legacyGamesPath: LEGACY_GAMES_PATH,
    logSensitive: LOG_SENSITIVE
  });
});

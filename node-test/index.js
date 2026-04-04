"use strict";

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
const registerLegacyRoutes = require("./routes/legacy");
const registerSportsengineScheduleRoutes = require("./routes/sportsengine-schedule");

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

registerSportsengineScheduleRoutes(app);
registerLegacyRoutes(app);

app.listen(PORT, () => {
  logInfo(`Legacy middleware listening on http://localhost:${PORT}`, {
    legacyBaseUrl: LEGACY_BASE_URL,
    legacyLoginPath: LEGACY_LOGIN_PATH,
    legacyGamesPath: LEGACY_GAMES_PATH,
    logSensitive: LOG_SENSITIVE
  });
});

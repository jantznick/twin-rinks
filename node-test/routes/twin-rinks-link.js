"use strict";

const express = require("express");
const { requireAuth, publicUser } = require("../middleware/auth");
const {
  linkTwinRinksAccount,
  unlinkTwinRinksAccount,
  twinRinksStatus
} = require("../utils/twin-rinks-session");

const router = express.Router();

router.get("/twin-rinks/status", requireAuth, (req, res) => {
  return res.json({
    ok: true,
    ...twinRinksStatus(req.user),
    user: publicUser(req.user)
  });
});

router.post("/twin-rinks/link", requireAuth, async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) {
    return res.status(400).json({
      ok: false,
      error: "username and password are required"
    });
  }

  try {
    const result = await linkTwinRinksAccount(req.user.id, username, password);
    if (!result.ok) {
      return res.status(result.status || 401).json({
        ok: false,
        error: result.error,
        code: result.code
      });
    }
    return res.json({
      ok: true,
      ...twinRinksStatus(result.user),
      user: publicUser(result.user)
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to link Twin Rinks account"
    });
  }
});

router.delete("/twin-rinks/link", requireAuth, async (req, res) => {
  try {
    const result = await unlinkTwinRinksAccount(req.user.id);
    if (!result.ok) {
      return res.status(result.status || 500).json({
        ok: false,
        error: result.error,
        code: result.code
      });
    }
    return res.json({
      ok: true,
      ...twinRinksStatus(result.user),
      user: publicUser(result.user)
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to unlink Twin Rinks account"
    });
  }
});

module.exports = router;

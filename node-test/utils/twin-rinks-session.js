"use strict";

const { getPrisma } = require("../lib/prisma");
const { encryptSecret, decryptSecret } = require("./legacy-credentials");
const { loginToLegacy } = require("./legacy-login");
const { verifyTwinRinksSessionAndGetEmail } = require("./twin-rinks-session-verify");
const { logInfo } = require("./logger");
const { maskSessionId } = require("./legacy-session");

const SESSION_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

function maskUsername(username) {
  const s = String(username || "");
  if (s.length <= 2) {
    return "***";
  }
  if (s.length <= 4) {
    return `${s[0]}***`;
  }
  return `${s.slice(0, 2)}***${s.slice(-1)}`;
}

async function linkTwinRinksAccount(userId, username, password) {
  const prisma = getPrisma();
  if (!prisma) {
    return { ok: false, status: 503, error: "Database unavailable", code: "database_unavailable" };
  }

  const login = await loginToLegacy(username, password);
  if (!login.ok) {
    return {
      ok: false,
      status: 401,
      error: login.error || "Invalid Twin Rinks username or password",
      code: "legacy_login_failed"
    };
  }

  const passwordEnc = encryptSecret(password);
  const now = new Date();
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      twinRinksUsername: String(username).trim(),
      twinRinksPasswordEnc: passwordEnc,
      twinRinksPhpsessid: login.phpsessid,
      twinRinksSessionUpdatedAt: now,
      twinRinksLinkedAt: now
    }
  });

  return { ok: true, user };
}

async function unlinkTwinRinksAccount(userId) {
  const prisma = getPrisma();
  if (!prisma) {
    return { ok: false, status: 503, error: "Database unavailable", code: "database_unavailable" };
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      twinRinksUsername: null,
      twinRinksPasswordEnc: null,
      twinRinksPhpsessid: null,
      twinRinksSessionUpdatedAt: null,
      twinRinksLinkedAt: null
    }
  });
  return { ok: true, user };
}

function twinRinksStatus(user) {
  const linked = Boolean(user?.twinRinksUsername && user?.twinRinksPasswordEnc);
  const updatedAt = user?.twinRinksSessionUpdatedAt
    ? new Date(user.twinRinksSessionUpdatedAt).getTime()
    : 0;
  const sessionFresh =
    linked &&
    Boolean(user.twinRinksPhpsessid) &&
    updatedAt > 0 &&
    Date.now() - updatedAt < SESSION_MAX_AGE_MS;

  return {
    linked,
    usernameMasked: linked ? maskUsername(user.twinRinksUsername) : null,
    username: linked ? user.twinRinksUsername : null,
    linkedAt: user?.twinRinksLinkedAt
      ? new Date(user.twinRinksLinkedAt).toISOString()
      : null,
    sessionFresh,
    sessionUpdatedAt: user?.twinRinksSessionUpdatedAt
      ? new Date(user.twinRinksSessionUpdatedAt).toISOString()
      : null
  };
}

/**
 * Return a valid PHPSESSID for the user, refreshing via stored credentials if needed.
 */
async function getValidPhpsessid(user) {
  if (!user?.twinRinksUsername || !user?.twinRinksPasswordEnc) {
    return {
      ok: false,
      code: "twin_rinks_not_linked",
      error: "Twin Rinks account not linked"
    };
  }

  const prisma = getPrisma();
  if (!prisma) {
    return {
      ok: false,
      code: "database_unavailable",
      error: "Database unavailable"
    };
  }

  const updatedAt = user.twinRinksSessionUpdatedAt
    ? new Date(user.twinRinksSessionUpdatedAt).getTime()
    : 0;
  const ageOk = updatedAt > 0 && Date.now() - updatedAt < SESSION_MAX_AGE_MS;

  if (user.twinRinksPhpsessid && ageOk) {
    const verify = await verifyTwinRinksSessionAndGetEmail(user.twinRinksPhpsessid);
    if (verify.ok) {
      return { ok: true, phpsessid: user.twinRinksPhpsessid, refreshed: false };
    }
  } else if (user.twinRinksPhpsessid) {
    const verify = await verifyTwinRinksSessionAndGetEmail(user.twinRinksPhpsessid);
    if (verify.ok) {
      await prisma.user.update({
        where: { id: user.id },
        data: { twinRinksSessionUpdatedAt: new Date() }
      });
      return { ok: true, phpsessid: user.twinRinksPhpsessid, refreshed: false };
    }
  }

  let password;
  try {
    password = decryptSecret(user.twinRinksPasswordEnc);
  } catch (error) {
    logInfo("Failed to decrypt Twin Rinks password", {
      userId: user.id,
      error: error.message
    });
    return {
      ok: false,
      code: "legacy_credentials_corrupt",
      error: "Stored Twin Rinks credentials could not be decrypted"
    };
  }

  const login = await loginToLegacy(user.twinRinksUsername, password);
  if (!login.ok) {
    return {
      ok: false,
      code: "legacy_relogin_failed",
      error: login.error || "Failed to refresh Twin Rinks session"
    };
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      twinRinksPhpsessid: login.phpsessid,
      twinRinksSessionUpdatedAt: now
    }
  });

  logInfo("Refreshed Twin Rinks PHPSESSID", {
    userId: user.id,
    session: maskSessionId(login.phpsessid)
  });

  return { ok: true, phpsessid: login.phpsessid, refreshed: true };
}

/**
 * Background refresh for linked users with stale sessions.
 */
async function refreshStaleTwinRinksSessions() {
  const prisma = getPrisma();
  if (!prisma) {
    return { refreshed: 0, failed: 0, skipped: 0 };
  }

  const cutoff = new Date(Date.now() - SESSION_MAX_AGE_MS);
  const users = await prisma.user.findMany({
    where: {
      twinRinksUsername: { not: null },
      twinRinksPasswordEnc: { not: null },
      OR: [
        { twinRinksSessionUpdatedAt: null },
        { twinRinksSessionUpdatedAt: { lt: cutoff } }
      ]
    }
  });

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of users) {
    const result = await getValidPhpsessid(user);
    if (result.ok && result.refreshed) {
      refreshed += 1;
    } else if (result.ok) {
      skipped += 1;
    } else {
      failed += 1;
      logInfo("Twin Rinks session refresh failed", {
        userId: user.id,
        code: result.code,
        error: result.error
      });
    }
  }

  logInfo("Twin Rinks session refresh job finished", {
    candidates: users.length,
    refreshed,
    skipped,
    failed
  });

  return { refreshed, failed, skipped };
}

module.exports = {
  SESSION_MAX_AGE_MS,
  maskUsername,
  linkTwinRinksAccount,
  unlinkTwinRinksAccount,
  twinRinksStatus,
  getValidPhpsessid,
  refreshStaleTwinRinksSessions
};

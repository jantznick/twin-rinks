"use strict";

const {
  LEGACY_BASE_URL,
  LEGACY_SUBMIT_PATH,
  LOG_SENSITIVE
} = require("../config");
const { logInfo } = require("./logger");
const {
  headersToObject,
  buildBodyPreview,
  buildCurlCommand
} = require("./http");
const {
  looksLikeLegacyLoginPage,
  isLegacyLoginRedirect
} = require("./legacy-pages");
const { maskSessionId } = require("./legacy-session");

function normalizeLegacyProfilePassword(profileData) {
  const p = { ...profileData };
  if (p.password !== undefined && p.pass === undefined) {
    p.pass = p.password;
  }
  return p;
}

/**
 * New clients: body.twinRinksProfile. Legacy: flat profile fields alongside phpsessid/email/sportsengineCalendars.
 */
function getLegacyProfilePayload(body) {
  if (!body || typeof body !== "object") {
    return null;
  }
  if (body.twinRinksProfile != null && typeof body.twinRinksProfile === "object") {
    return normalizeLegacyProfilePassword(body.twinRinksProfile);
  }
  const skip = new Set(["phpsessid", "email", "sportsengineCalendars", "twinRinksProfile"]);
  const out = {};
  for (const k of Object.keys(body)) {
    if (skip.has(k)) {
      continue;
    }
    out[k] = body[k];
  }
  if (Object.keys(out).length === 0) {
    return null;
  }
  return normalizeLegacyProfilePassword(out);
}

/**
 * POST Twin Rinks subs profile form to the legacy site.
 * @returns {{ ok: true } | { ok: false, status: number, body: object }}
 */
async function forwardTwinRinksProfileToLegacy(phpsessid, profileData) {
  try {
    const submitUrl = new URL(LEGACY_SUBMIT_PATH, LEGACY_BASE_URL).toString();
    const bodyParams = new URLSearchParams();

    const fields = [
      "profile",
      "email",
      "player",
      "pass",
      "position",
      "cell",
      "carrier",
      "chatid"
    ];

    for (const field of fields) {
      if (profileData[field] !== undefined) {
        bodyParams.append(field, profileData[field]);
      }
    }

    if (profileData.t_enabled === false) {
      bodyParams.append("t_day", "0");
      bodyParams.append("t_hou", "0");
      bodyParams.append("t_min", "0");
    } else {
      bodyParams.append("t_day", profileData.t_day || "0");
      bodyParams.append("t_hou", profileData.t_hou || "0");
      bodyParams.append("t_min", profileData.t_min || "0");
    }

    if (profileData.e_enabled === false) {
      bodyParams.append("e_day", "0");
      bodyParams.append("e_hou", "0");
      bodyParams.append("e_min", "0");
    } else {
      bodyParams.append("e_day", profileData.e_day || "0");
      bodyParams.append("e_hou", profileData.e_hou || "0");
      bodyParams.append("e_min", profileData.e_min || "0");
    }

    bodyParams.append("s_day", profileData.s_day || "0");
    bodyParams.append("s_hou", profileData.s_hou || "0");
    bodyParams.append("s_min", profileData.s_min || "0");

    if (profileData.test_text) bodyParams.append("text", "on");
    if (profileData.test_mail) bodyParams.append("mail", "on");

    bodyParams.append("required", "position");
    bodyParams.append(
      "data_order",
      "profile,player,email,pass,position,cell,carrier,chatid,t_day,t_hou,t_min,e_day,e_hou,e_min,s_day,s_hou,s_min,text,mail"
    );
    bodyParams.append("outputfile", "../adulthockey/subs/subs_entry");
    bodyParams.append("countfile", "form1");
    bodyParams.append("emailfile", "form1");
    bodyParams.append("form_id", "My Test Form");
    bodyParams.append("ok_url", "../adulthockey/subs/subs_submit_ok.html");
    bodyParams.append("not_ok_url", "../adulthockey/subs/sub_submit_not_ok.html");

    const cookieValueForLogs = LOG_SENSITIVE
      ? `PHPSESSID=${phpsessid}`
      : `PHPSESSID=${maskSessionId(phpsessid)}`;

    const submitCurl = buildCurlCommand({
      method: "POST",
      url: submitUrl,
      headers: {
        Cookie: cookieValueForLogs,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams.toString()
    });

    logInfo("Submitting profile update to legacy", {
      session: maskSessionId(phpsessid)
    });
    logInfo("Legacy profile submit request target", {
      url: submitUrl,
      command: submitCurl
    });

    const response = await fetch(submitUrl, {
      method: "POST",
      headers: {
        Cookie: `PHPSESSID=${phpsessid}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams,
      redirect: "manual"
    });

    const responseHeaders = headersToObject(response.headers);
    const responseBody = await response.text();
    const bodyPreview = buildBodyPreview(responseBody);

    logInfo("Legacy profile submit response received", {
      status: response.status,
      location: response.headers.get("location"),
      headers: responseHeaders,
      bodyPreview
    });

    if (response.status >= 400) {
      return {
        ok: false,
        status: 401,
        body: {
          ok: false,
          error: `Legacy profile submit request failed with status ${response.status}`,
          code: "session_expired"
        }
      };
    }

    if (isLegacyLoginRedirect(response) || looksLikeLegacyLoginPage(responseBody)) {
      logInfo("Legacy profile submit redirected to login (session expired)", {
        status: response.status,
        responseUrl: response.url,
        location: response.headers.get("location"),
        session: maskSessionId(phpsessid),
        bodyPreview
      });
      return {
        ok: false,
        status: 401,
        body: {
          ok: false,
          error: "Legacy session expired",
          code: "session_expired"
        }
      };
    }

    return { ok: true };
  } catch (error) {
    logInfo("Legacy profile submit request failed", { error: error.message });
    return {
      ok: false,
      status: 502,
      body: {
        ok: false,
        error: "Legacy profile submit request failed",
        details: error.message
      }
    };
  }
}

module.exports = {
  normalizeLegacyProfilePassword,
  getLegacyProfilePayload,
  forwardTwinRinksProfileToLegacy
};

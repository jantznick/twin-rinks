"use strict";

function looksLikeAuthenticatedGamesPage(html) {
  const text = String(html || "");
  if (!text) {
    return false;
  }

  if (/Games you can sub in:/i.test(text)) {
    return true;
  }
  if (/Your Games:/i.test(text)) {
    return true;
  }
  if (/Click here to update your profile information/i.test(text)) {
    return true;
  }
  if (/name=["']profile["']/i.test(text)) {
    return true;
  }
  if (/name=["']g\d+i?["']/i.test(text)) {
    return true;
  }

  if (/name=["']subs_data1["']/i.test(text) || /name=["']subs_data2["']/i.test(text)) {
    return false;
  }
  if (/invalid\s+(user(name)?|login|password|credentials)/i.test(text)) {
    return false;
  }

  return false;
}

function looksLikeLegacyLoginPage(html) {
  const text = String(html || "");
  if (!text) {
    return false;
  }
  if (looksLikeAuthenticatedGamesPage(text)) {
    return false;
  }
  if (/name=["']subs_data1["']/i.test(text) && /name=["']subs_data2["']/i.test(text)) {
    return true;
  }
  if (/subs_entry\.html\?state=invalid_login/i.test(text)) {
    return true;
  }
  return false;
}

function isLegacyLoginRedirect(response) {
  if (!response) {
    return false;
  }
  const location = String(response.headers?.get("location") || "");
  const finalUrl = String(response.url || "");
  return (
    /subs_entry\.html(?:\?[^"'\s]*)?/i.test(location) ||
    /subs_entry\.html(?:\?[^"'\s]*)?/i.test(finalUrl) ||
    /state=invalid_login/i.test(location) ||
    /state=invalid_login/i.test(finalUrl)
  );
}

module.exports = {
  looksLikeAuthenticatedGamesPage,
  looksLikeLegacyLoginPage,
  isLegacyLoginRedirect
};

"use strict";

const { BODY_PREVIEW_LIMIT } = require("../config");

function headersToObject(headers) {
  const result = {};
  for (const [key, value] of headers.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function buildBodyPreview(bodyText) {
  if (!bodyText) {
    return "";
  }
  const normalized = String(bodyText).replace(/\s+/g, " ").trim();
  if (normalized.length <= BODY_PREVIEW_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, BODY_PREVIEW_LIMIT)}... [truncated]`;
}

function shellQuote(value) {
  const input = String(value ?? "");
  return `'${input.replace(/'/g, "'\"'\"'")}'`;
}

function buildCurlCommand({ method, url, headers = {}, body = null }) {
  const parts = [`curl -i -X ${method.toUpperCase()} ${shellQuote(url)}`];
  for (const [key, value] of Object.entries(headers)) {
    parts.push(`-H ${shellQuote(`${key}: ${value}`)}`);
  }
  if (body) {
    parts.push(`--data ${shellQuote(body)}`);
  }
  return parts.join(" \\\n  ");
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

module.exports = {
  headersToObject,
  buildBodyPreview,
  shellQuote,
  buildCurlCommand,
  getSetCookieHeaders
};

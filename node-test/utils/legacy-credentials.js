"use strict";

const crypto = require("crypto");
const { LEGACY_CREDENTIALS_KEY } = require("../config");

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function getKey() {
  const raw = String(LEGACY_CREDENTIALS_KEY || "").trim();
  if (!raw) {
    throw new Error("LEGACY_CREDENTIALS_KEY is not configured");
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) {
      return buf;
    }
  } catch {
    // fall through
  }
  // Derive a stable 32-byte key from whatever string was provided (dev convenience).
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Encrypt plaintext → base64(iv | tag | ciphertext)
 */
function encryptSecret(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptSecret(payload) {
  const key = getKey();
  const buf = Buffer.from(String(payload), "base64");
  if (buf.length < IV_LEN + 16 + 1) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const data = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

module.exports = {
  encryptSecret,
  decryptSecret
};

"use strict";

function parseInputAttributes(inputTag) {
  const attributes = {};
  const attrRegex =
    /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;
  let match = attrRegex.exec(inputTag);

  while (match) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes[key] = value;
    match = attrRegex.exec(inputTag);
  }

  return attributes;
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitGameRows(html) {
  return html
    .split(/<br\s*\/?>/gi)
    .map((row) => row.trim())
    .filter(Boolean)
    .filter((row) => /name=["']g\d+["']/i.test(row));
}

function parseGameRow(rowHtml) {
  const inputRegex = /<input\b[^>]*>/gi;
  const inputs = [];
  let inputMatch = inputRegex.exec(rowHtml);

  while (inputMatch) {
    inputs.push(parseInputAttributes(inputMatch[0]));
    inputMatch = inputRegex.exec(rowHtml);
  }

  const detailsInput = inputs.find((input) =>
    /^g\d+$/i.test(input.name || "")
  );
  if (!detailsInput) {
    return null;
  }

  const gameId = (detailsInput.name || "").toLowerCase();
  const options = inputs.filter(
    (input) => (input.name || "").toLowerCase() === `${gameId}i`
  );

  const optionValues = options.map((option) => ({
    type: (option.type || "").toLowerCase(),
    value: option.value || "",
    checked: Object.prototype.hasOwnProperty.call(option, "checked")
  }));

  const selected =
    optionValues.find((option) => option.checked)?.value || "UNSET";

  const infoText = extractInfoTextAfterGameInput(rowHtml, detailsInput);

  const schedule = parseDateTimeRink(detailsInput.value || "");
  const details = parseInfoText(infoText);
  const stage = deriveStage({
    selected,
    infoText,
    options: optionValues
  });

  return {
    gameId,
    dateTimeRink: detailsInput.value || "",
    infoText,
    selected,
    options: optionValues,
    schedule,
    details,
    stage
  };
}

function extractInfoTextAfterGameInput(rowHtml, detailsInput) {
  const gameName = escapeRegex(detailsInput.name || "");
  const inputRegex = new RegExp(
    `<input\\b[^>]*\\bname\\s*=\\s*(?:"${gameName}"|'${gameName}'|${gameName})[^>]*>`,
    "i"
  );
  const inputMatch = inputRegex.exec(rowHtml);

  const segment = inputMatch
    ? rowHtml.slice(inputMatch.index + inputMatch[0].length)
    : rowHtml;

  return stripTags(segment)
    .replace(/\bIn\s+Out\b/gi, "")
    .replace(/\bOUT\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSubsHtml(html) {
  const rows = splitGameRows(html);
  const games = rows.map(parseGameRow).filter(Boolean);
  return {
    gameCount: games.length,
    games
  };
}

function parseDateTimeRink(value) {
  const tokens = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    raw: value || "",
    date: tokens[0] || "",
    day: tokens[1] || "",
    time: tokens[2] || "",
    rink: tokens[3] || ""
  };
}

function parseInfoText(infoText) {
  const normalized = String(infoText || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return {
      kind: "empty",
      summary: ""
    };
  }

  if (/^you are playing/i.test(normalized)) {
    return {
      kind: "playing",
      summary: normalized
    };
  }

  const matchupMatch = normalized.match(
    /^([A-Z]+)\s+([A-Z]+)\s+vs\s+([A-Z]+)\s*(.*)$/i
  );
  if (matchupMatch) {
    const trailingNote = matchupMatch[4].trim();
    return {
      kind: "matchup",
      league: matchupMatch[1].toUpperCase(),
      teamA: matchupMatch[2].toUpperCase(),
      teamB: matchupMatch[3].toUpperCase(),
      note: trailingNote,
      summary: `${matchupMatch[2].toUpperCase()} vs ${matchupMatch[3].toUpperCase()}`
    };
  }

  return {
    kind: "text",
    summary: normalized
  };
}

function deriveStage({ selected, infoText, options }) {
  const selectedValue = (selected || "").toUpperCase();
  if (selectedValue === "IN") {
    return "confirmed-in";
  }
  if (selectedValue === "OUT") {
    return "out";
  }
  if (selectedValue === "SUB") {
    return "sub-requested";
  }

  const normalizedText = String(infoText || "").toLowerCase();
  if (normalizedText.includes("you are playing")) {
    return "selected";
  }

  const hasSubOption = options.some((option) => option.value === "SUB");
  if (hasSubOption) {
    return "available";
  }

  return "unknown";
}

module.exports = {
  parseSubsHtml
};

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

function extractInfoTextFromSegment(segment) {
  return stripTags(segment)
    .replace(/\bIn\s+Out\b/gi, "")
    .replace(/\bOUT\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeScheduleValue(value) {
  return /^\d{2}\/\d{2}\/\d{4}\s+[A-Z]{3}\s+\d{1,2}:\d{2}[AP]/i.test(
    String(value || "").trim()
  );
}

function parseSubsHtml(html) {
  // Split the HTML into the "Your Games" and "Games you can sub in" sections
  // so we only parse the sub games and ignore their regular roster games.
  const subGamesSection = String(html || "").split(/Games you can sub in:/i)[1] || html;

  // Extract the profile code from the HTML
  const profileMatch = String(html || "").match(/<input[^>]*name=["']profile["'][^>]*value=["']([^"']+)["']/i);
  const profile = profileMatch ? profileMatch[1] : "";

  const profileLinkMatch = String(html || "").match(/<a[^>]*href=["']([^"']+\.php)["'][^>]*>Click here to update your profile information<\/a>/i);
  const profilePath = profileLinkMatch ? profileLinkMatch[1] : "";

  const rows = String(subGamesSection)
    .split(/<br\s*\/?>/gi)
    .map((row) => row.trim())
    .filter(Boolean);
  const games = [];
  let syntheticId = 1;

  for (const rowHtml of rows) {
    const inputRegex = /<input\b[^>]*>/gi;
    const rowInputs = [];
    let match = inputRegex.exec(rowHtml);
    while (match) {
      rowInputs.push({
        tag: match[0],
        start: match.index,
        end: match.index + match[0].length,
        attrs: parseInputAttributes(match[0])
      });
      match = inputRegex.exec(rowHtml);
    }

    const detailInput = rowInputs.find((input) => {
      const type = String(input.attrs.type || "").toLowerCase();
      return type === "text" && looksLikeScheduleValue(input.attrs.value || "");
    });

    if (!detailInput) {
      continue;
    }

    const explicitGameId = (detailInput.attrs.name || "").toLowerCase();
    const gameId = /^g\d+$/i.test(explicitGameId)
      ? explicitGameId
      : `synthetic-${syntheticId++}`;

    const infoText = extractInfoTextFromSegment(rowHtml.slice(detailInput.end));
    const optionName = /^g\d+$/i.test(explicitGameId) ? `${explicitGameId}i` : null;
    const options = rowInputs
      .filter((input) => {
        if (!optionName) {
          return false;
        }
        return (input.attrs.name || "").toLowerCase() === optionName;
      })
      .map((input) => ({
        type: (input.attrs.type || "").toLowerCase(),
        value: input.attrs.value || "",
        checked: Object.prototype.hasOwnProperty.call(input.attrs, "checked")
      }));

    const selected = options.find((option) => option.checked)?.value || "UNSET";
    const schedule = parseDateTimeRink(detailInput.attrs.value || "");
    const details = parseInfoText(infoText);
    const stage = deriveStage({
      selected,
      infoText,
      options
    });

    games.push({
      gameId,
      dateTimeRink: detailInput.attrs.value || "",
      infoText,
      selected,
      options,
      schedule,
      details,
      stage
    });
  }

  return {
    gameCount: games.length,
    profile,
    profilePath,
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

  if (isPlayingText(normalized)) {
    const summary = normalized
      .split(/goalie-if/i)[0]
      .replace(/\s+/g, " ")
      .trim();
    return {
      kind: "playing",
      summary: summary || normalized
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

  if (normalizedText.includes("you are not available")) {
    return "out";
  }

  if (isPlayingText(normalizedText)) {
    const hasInOption = options.some((option) => option.value === "IN");
    if (!hasInOption) {
      return "confirmed-in";
    }
    return "selected";
  }

  const hasSubOption = options.some((option) => option.value === "SUB");
  if (hasSubOption) {
    return "available";
  }

  return "unknown";
}

function isPlayingText(text) {
  const normalized = String(text || "").toLowerCase();
  return (
    normalized.includes("you are playing") ||
    normalized.includes("you are the goalie for") ||
    normalized.includes("goalie-if you will miss this game")
  );
}

function parseProfileHtml(html) {
  const data = {};
  
  const getInputValue = (name) => {
    const regex = new RegExp(`<input\\b[^>]*name=["']?${name}["']?[^>]*>`, 'i');
    const match = html.match(regex);
    if (match) {
      const attrs = parseInputAttributes(match[0]);
      return attrs.value || "";
    }
    return "";
  };

  const getRadioChecked = (name) => {
    const regex = new RegExp(`<input\\b[^>]*type=["']?radio["']?[^>]*name=["']?${name}["']?[^>]*>`, 'gi');
    const matches = html.match(regex) || [];
    for (const m of matches) {
      const attrs = parseInputAttributes(m);
      if (Object.prototype.hasOwnProperty.call(attrs, "checked")) {
        return attrs.value || "";
      }
    }
    return "";
  };

  const getSelectSelected = (name) => {
    const selectRegex = new RegExp(`<select\\b[^>]*name=["']?${name}["']?[\\s\\S]*?</select>`, 'i');
    const selectMatch = html.match(selectRegex);
    if (selectMatch) {
      const options = selectMatch[0].match(/<option\\b[^>]*>([\\s\\S]*?)<\/option>/gi) || [];
      for (const opt of options) {
        if (/selected/i.test(opt)) {
          const valMatch = opt.match(/value=["']?([^"'>\\s]+)/i);
          if (valMatch) return valMatch[1];
        }
      }
    }
    return "";
  };

  const getCheckboxChecked = (name) => {
    const regex = new RegExp(`<input\\b[^>]*type=["']?checkbox["']?[^>]*name=["']?${name}["']?[^>]*>`, 'i');
    const match = html.match(regex);
    if (match) {
      const attrs = parseInputAttributes(match[0]);
      return Object.prototype.hasOwnProperty.call(attrs, "checked");
    }
    return false;
  };

  data.email = getInputValue("email");
  data.player = getInputValue("player");
  data.position = getRadioChecked("position");
  data.cell = getInputValue("cell");
  data.carrier = getSelectSelected("carrier");
  data.chatid = getInputValue("chatid");
  
  data.t_day = getInputValue("t_day");
  data.t_hou = getInputValue("t_hou");
  data.t_min = getInputValue("t_min");
  
  data.e_day = getInputValue("e_day");
  data.e_hou = getInputValue("e_hou");
  data.e_min = getInputValue("e_min");
  
  data.s_day = getInputValue("s_day");
  data.s_hou = getInputValue("s_hou");
  data.s_min = getInputValue("s_min");
  
  data.test_text = getCheckboxChecked("text");
  data.test_mail = getCheckboxChecked("mail");

  return data;
}

module.exports = {
  parseSubsHtml,
  parseProfileHtml
};

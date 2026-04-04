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

function extractGames(sectionHtml) {
  const games = [];
  const ids = new Set();

  const inputRegex = /<input\b[^>]*>/gi;
  let inputMatch = inputRegex.exec(sectionHtml);
  const parsedInputs = [];

  while (inputMatch) {
    const attrs = parseInputAttributes(inputMatch[0]);
    parsedInputs.push(attrs);
    const idMatch = (attrs.name || "").match(/^g(\d+)/i);
    if (idMatch) {
      ids.add(idMatch[1]);
    }
    inputMatch = inputRegex.exec(sectionHtml);
  }

  [...ids]
    .sort((a, b) => Number(a) - Number(b))
    .forEach((id) => {
      const detailsInput =
        parsedInputs.find((input) => input.name === `g${id}`) || null;
      const selectionInputs = parsedInputs.filter(
        (input) => input.name === `g${id}i`
      );

      const selectionOptions = [];
      let selectedValue = null;

      for (const input of selectionInputs) {
        const type = (input.type || "").toLowerCase();
        const value = input.value || "";
        const checked = Object.prototype.hasOwnProperty.call(input, "checked");

        if (checked) {
          selectedValue = value;
        }

        selectionOptions.push({
          type,
          value,
          checked
        });
      }

      games.push({
        gameId: `g${id}`,
        description: detailsInput?.value || null,
        selectedValue,
        options: selectionOptions
      });
    });

  return games;
}

function findGamesSection(html) {
  const tableRegex = /<table\b[\s\S]*?<\/table>/gi;
  let tableMatch = tableRegex.exec(html);

  while (tableMatch) {
    const tableHtml = tableMatch[0];
    const hasGameInputs = /name=["']g\d+i?["']/i.test(tableHtml);
    const hasGamesText = /your games/i.test(tableHtml);
    if (hasGameInputs || hasGamesText) {
      return { type: "table", html: tableHtml };
    }
    tableMatch = tableRegex.exec(html);
  }

  const formRegex = /<form\b[\s\S]*?<\/form>/gi;
  let formMatch = formRegex.exec(html);
  while (formMatch) {
    const formHtml = formMatch[0];
    const hasGameInputs = /name=["']g\d+i?["']/i.test(formHtml);
    const hasGamesText = /your games/i.test(formHtml);
    if (hasGameInputs || hasGamesText) {
      return { type: "form", html: formHtml };
    }
    formMatch = formRegex.exec(html);
  }

  const hasAnyGameInputs = /name=["']g\d+i?["']/i.test(html);
  if (hasAnyGameInputs) {
    return { type: "document", html };
  }

  return null;
}

module.exports = {
  parseInputAttributes,
  extractGames,
  findGamesSection
};

"use strict";

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicEntities(text) {
  return String(text || "")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseSportsengineTeamScheduleHtml(html) {
  const fullHtml = String(html || "");
  const tableMatch = fullHtml.match(
    /<table\b[^>]*class=["'][^"']*statTable[^"']*["'][^>]*>[\s\S]*?<\/table>/i
  );
  const scope = tableMatch ? tableMatch[0] : fullHtml;

  const games = [];
  const rowRegex =
    /<tr\b[^>]*\bid=["']game_list_row_(\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch = rowRegex.exec(scope);

  while (rowMatch) {
    const gameListId = rowMatch[1];
    const row = rowMatch[2];
    const tdContents = [];
    const tdRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch = tdRegex.exec(row);
    while (tdMatch) {
      tdContents.push(tdMatch[1]);
      tdMatch = tdRegex.exec(row);
    }

    if (tdContents.length >= 5) {
      const dateRaw = stripTags(tdContents[0]);
      const resultRaw = stripTags(tdContents[1]);
      const oppCell = tdContents[2];
      const isAway = /@/.test(oppCell);
      const teamNameMatch = oppCell.match(
        /<a\b[^>]*class=["'][^"']*teamName[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
      );
      let opponentName = teamNameMatch
        ? stripTags(teamNameMatch[2])
        : stripTags(oppCell).replace(/^@\s*/, "").trim();
      opponentName = decodeBasicEntities(opponentName);
      const opponentUrl = teamNameMatch ? teamNameMatch[1] : "";

      const location = decodeBasicEntities(stripTags(tdContents[3]));

      const statusCell = tdContents[4];
      const gameLinkMatch = statusCell.match(
        /<a\b[^>]*class=["'][^"']*game_link_referrer[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
      );
      const gameUrl = gameLinkMatch ? gameLinkMatch[1] : "";
      const statusTime = gameLinkMatch
        ? decodeBasicEntities(stripTags(gameLinkMatch[2]))
        : decodeBasicEntities(stripTags(statusCell));

      games.push({
        gameId: gameListId,
        dateRaw,
        resultRaw,
        isAway,
        opponentName,
        opponentUrl,
        location,
        statusTime,
        gameUrl
      });
    }

    rowMatch = rowRegex.exec(scope);
  }

  return {
    gameCount: games.length,
    games,
    parserVersion: "sportsengine-team-schedule-v3"
  };
}

module.exports = {
  parseSportsengineTeamScheduleHtml
};

import seasonCalendar from "../data/seasonCalendar.json";

export function normalizeGames(gamesResponse) {
  if (!gamesResponse || !gamesResponse.games) {
    return [];
  }
  if (Array.isArray(gamesResponse.games)) {
    return gamesResponse.games;
  }
  if (typeof gamesResponse.games === "object") {
    return Object.values(gamesResponse.games);
  }
  return [];
}

export function getOptionValues(game) {
  return new Set((game?.options || []).map((option) => option.value));
}

export function buildDraftSelections(games) {
  const draft = {};
  for (const game of games) {
    const subChecked = (game.options || []).some(
      (option) => option.value === "SUB" && option.checked
    );
    const radioChecked = (game.options || []).find(
      (option) => option.type === "radio" && option.checked
    );
    let attendance =
      radioChecked?.value ||
      (game.selected === "IN" || game.selected === "OUT" ? game.selected : "");

    if (!attendance && game.stage === "out") attendance = "OUT";
    if (!attendance && game.stage === "confirmed-in") attendance = "IN";

    draft[game.gameId] = {
      sub: subChecked || game.selected === "SUB" || game.stage === "sub-requested",
      attendance
    };
  }
  return draft;
}

export function countSelected(games, draftSelections) {
  let subCount = 0;
  let inCount = 0;
  let outCount = 0;
  for (const game of games) {
    const selection = draftSelections[game.gameId];
    if (selection?.sub) {
      subCount += 1;
    }
    if (selection?.attendance === "IN") {
      inCount += 1;
    }
    if (selection?.attendance === "OUT") {
      outCount += 1;
    }
  }
  return { subCount, inCount, outCount };
}

export function hasDraftChanges(games, initialDraft, draftSelections, hiddenGames) {
  for (const game of games) {
    const base = initialDraft[game.gameId] || { sub: false, attendance: "" };
    const draft = draftSelections[game.gameId] || { sub: false, attendance: "" };
    if (
      Boolean(base.sub) !== Boolean(draft.sub) ||
      (base.attendance || "") !== (draft.attendance || "")
    ) {
      return true;
    }
    if (hiddenGames[game.gameId]) {
      return true;
    }
  }
  return false;
}

export function getScheduleText(game) {
  const schedule = game?.schedule || {};
  if (schedule.date && schedule.day && schedule.time) {
    return `${schedule.date} ${schedule.day} ${schedule.time}`;
  }
  return game?.dateTimeRink || "Schedule unavailable";
}

export function getTimeText(game) {
  return game?.schedule?.time || "";
}

export function getRink(game) {
  return game?.schedule?.rink ? game.schedule.rink.toUpperCase() : "";
}

export function getGameHeadline(game) {
  if (game?.details?.kind === "matchup") {
    return `${game.details.league}: ${game.details.teamA} vs ${game.details.teamB}`;
  }
  if (game?.details?.summary) {
    return game.details.summary;
  }
  
  let text = game?.infoText || "Game";
  const prefixMatch = text.match(/^(.*?sub\.\s*)/i);
  if (prefixMatch && text.toLowerCase().includes("you are not available")) {
    text = text.substring(0, prefixMatch[1].length).trim();
  }
  return text;
}

export function getLeagueLabel(game) {
  if (game?.details?.kind === "matchup" && game?.details?.league) {
    return game.details.league;
  }
  if (game?.details?.kind === "playing") {
    return "Playing";
  }
  return "Game";
}

export function getGameNote(game) {
  let note = "";
  if (game?.details?.kind === "matchup" && game?.details?.note) {
    note = game.details.note;
  } else if (game?.details?.kind === "playing") {
    note = "";
  } else if (!game?.details?.note && game?.infoText && game?.details?.summary) {
    let text = game.infoText;
    const prefixMatch = text.match(/^(.*?sub\.\s*)/i);
    if (prefixMatch && text.toLowerCase().includes("you are not available")) {
      text = text.substring(0, prefixMatch[1].length).trim();
    }
    note = text;
  }

  // Remove redundant sub text since the status pill handles it
  if (note && (note.toLowerCase() === "i can sub" || note.toLowerCase() === "i can sub." || note.toLowerCase().includes("i can goalie sub") || note.toLowerCase().includes("i can skater sub"))) {
    return "";
  }

  return note;
}

const JERSEY_CHART = [
  { name: "WHITE", bg: "#ffffff", fg: "#000000" },
  { name: "YELLOW", bg: "#ffff00", fg: "#000000" },
  { name: "GREY", bg: "#b2babb", fg: "#000000" },
  { name: "TAN", bg: "#ffe885", fg: "#000000" },
  { name: "LIME", bg: "#59e800", fg: "#000000" },
  { name: "CORAL", bg: "#fa7dd9", fg: "#000000" },
  { name: "GOLD", bg: "#ffd105", fg: "#000000" },
  { name: "BLUE", bg: "#9cdeff", fg: "#000000" },
  { name: "VIOLET", bg: "#9e9eff", fg: "#000000" },
  { name: "BRASS", bg: "#917c0d", fg: "#ffffff" },
  { name: "COPPER", bg: "#bf5800", fg: "#ffffff" },
  { name: "ORANGE", bg: "#f15a29", fg: "#000000" },
  { name: "KELLY", bg: "#32ac00", fg: "#000000" },
  { name: "TEAL", bg: "#048c7f", fg: "#000000" },
  { name: "RED", bg: "#be1e2d", fg: "#ffffff" },
  { name: "ROYAL", bg: "#001c95", fg: "#ffffff" },
  { name: "PURPLE", bg: "#6305ff", fg: "#ffffff" },
  { name: "BROWN", bg: "#603913", fg: "#ffffff" },
  { name: "BLACK", bg: "#000000", fg: "#ffffff" }
];
const JERSEY_CHART_ORDER = JERSEY_CHART.map((entry) => entry.name);

const JERSEY_CHART_INDEX = new Map(
  JERSEY_CHART_ORDER.map((name, index) => [name, index])
);

export function getJerseyChartOrder() {
  return [...JERSEY_CHART_ORDER];
}

export function getJerseyChart() {
  return JERSEY_CHART.map((entry) => ({ ...entry }));
}

export function normalizeTeamColorName(value) {
  if (!value) {
    return "";
  }
  const normalized = String(value).trim().toUpperCase();
  return JERSEY_CHART_INDEX.has(normalized) ? normalized : "";
}

export function getJerseyColorForTeamMatchup(teamColor, opponentColor) {
  const team = normalizeTeamColorName(teamColor);
  const opponent = normalizeTeamColorName(opponentColor);
  if (!team || !opponent || team === opponent) {
    return "";
  }

  const teamIndex = JERSEY_CHART_INDEX.get(team);
  const opponentIndex = JERSEY_CHART_INDEX.get(opponent);
  if (teamIndex < opponentIndex) {
    return "WHITE";
  }
  if (teamIndex > opponentIndex) {
    return "BLACK";
  }
  return "";
}

export function getSubJerseyGuide(game) {
  if (game?.details?.kind === "playing") {
    const myTeam = getPlayingTeamColor(game);
    if (!myTeam) return null;

    const gameDate = parseGameDate(game);
    if (!gameDate) return null;

    const isoDate = `${gameDate.getFullYear()}-${String(gameDate.getMonth() + 1).padStart(2, "0")}-${String(gameDate.getDate()).padStart(2, "0")}`;
    
    // Format time to match seasonCalendar.json (e.g., "05:30 PM")
    let hours = gameDate.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const strHours = String(hours).padStart(2, "0");
    const strMins = String(gameDate.getMinutes()).padStart(2, "0");
    const formattedTime = `${strHours}:${strMins} ${ampm}`;

    const scheduleGames = Array.isArray(seasonCalendar) ? seasonCalendar : seasonCalendar.games || [];
    
    // Find the matching game in the schedule
    const matchedGame = scheduleGames.find(g => {
      if (g.date !== isoDate) return false;
      // Time matching can be tricky due to leading zeros, so we check both
      const gTime = String(g.time).trim().toUpperCase();
      const matchTime1 = formattedTime;
      const matchTime2 = `${hours}:${strMins} ${ampm}`; // without leading zero
      if (gTime !== matchTime1 && gTime !== matchTime2) return false;

      const home = normalizeTeamColorName(g.home);
      const away = normalizeTeamColorName(g.away);
      // We check if myTeam is a substring of home/away or vice versa, 
      // because the schedule might say "Coral" but myTeam parsed as "CORA"
      return home.includes(myTeam) || myTeam.includes(home) || 
             away.includes(myTeam) || myTeam.includes(away);
    });

    if (matchedGame) {
      const home = normalizeTeamColorName(matchedGame.home);
      const away = normalizeTeamColorName(matchedGame.away);
      const opponent = (home.includes(myTeam) || myTeam.includes(home)) ? away : home;
      const jersey = getJerseyColorForTeamMatchup(myTeam, opponent);
      
      if (jersey) {
        return {
          team: myTeam,
          jersey,
          text: `Wear a ${myTeam.toLowerCase()} or ${jersey.toLowerCase()} jersey (vs ${opponent})`
        };
      }
    }
    
    // Fallback if not found in schedule
    return {
      team: myTeam,
      jersey: "UNKNOWN",
      text: "Check jersey guide"
    };
  }

  if (game?.details?.kind !== "matchup") {
    return null;
  }

  const teamA = normalizeTeamColorName(game?.details?.teamA);
  const teamB = normalizeTeamColorName(game?.details?.teamB);
  if (!teamA || !teamB) {
    return null;
  }

  const jersey = getJerseyColorForTeamMatchup(teamA, teamB);
  if (!jersey) {
    return null;
  }

  return {
    team: teamA,
    jersey,
    text: `Subs wear a ${jersey.toLowerCase()} jersey`
  };
}

export function getPlayingTeamColor(game) {
  const source = String(game?.details?.summary || game?.infoText || "").toUpperCase();
  const compact = source.replace(/\s+/g, " ").trim();

  // Extract the 4 letter code like CORA from RECG-CORA
  const teamFromLeagueCode = compact.match(/\b[A-Z]{3,6}-([A-Z]+)\b/);
  if (teamFromLeagueCode?.[1]) {
    const rawCode = teamFromLeagueCode[1];
    
    // Check if the raw code is a direct match
    let normalized = normalizeTeamColorName(rawCode);
    if (normalized) return normalized;
    
    // If not a direct match, try to find a color in the chart that starts with this code
    // For example, "CORA" -> "CORAL", "PURP" -> "PURPLE"
    for (const color of JERSEY_CHART_ORDER) {
      if (color.startsWith(rawCode)) {
        return color;
      }
    }
  }

  const teamFromGoalieText = compact.match(/\bGOALIE\s+FOR\s+([A-Z]+)\b/);
  if (teamFromGoalieText?.[1]) {
    const rawCode = teamFromGoalieText[1];
    let normalized = normalizeTeamColorName(rawCode);
    if (normalized) return normalized;
    
    for (const color of JERSEY_CHART_ORDER) {
      if (color.startsWith(rawCode)) {
        return color;
      }
    }
  }

  let detected = "";
  for (const color of JERSEY_CHART_ORDER) {
    const regex = new RegExp(`\\b${color}\\b`, "i");
    if (regex.test(compact)) {
      detected = color;
    }
  }
  return detected;
}

export function isPlayerPlaying(game, selection) {
  if (selection?.attendance === "IN") {
    return true;
  }
  const stage = String(game?.stage || "").toLowerCase();
  return stage === "selected" || stage === "confirmed-in";
}

export function getSubSpotState(game) {
  const note = String(game?.details?.note || "").toLowerCase();
  if (note.includes("sub needed") || note.includes("sub spot needed")) {
    return "needed";
  }
  if (note.includes("sub spot filled")) {
    return "filled";
  }
  return null;
}

export function getStatusLabel(game, selection) {
  const subSpotState = getSubSpotState(game);
  if (selection?.attendance === "IN") {
    return "IN - playing";
  }
  if (selection?.attendance === "OUT") {
    return "OUT - not attending";
  }
  if (game?.stage === "out" && (!selection || selection.attendance === "")) {
    return "Pending: Unhide";
  }
  if (game?.stage === "sub-requested" && !selection?.sub) {
    return "Pending: Cancel Sub";
  }
  switch (game?.stage) {
    case "confirmed-in":
      return "IN - playing";
    case "out":
      return "OUT - not attending";
    case "sub-requested":
      if (subSpotState === "filled") {
        return "Sub requested (currently filled)";
      }
      return "Sub requested";
    case "selected":
      return "Action Required: Mark IN";
    case "available":
      if (game?.schedule?.date === formatDateKey(new Date())) {
        return "GAME TODAY: SUB NEEDED";
      }
      return "Available";
    default:
      if (game?.schedule?.date === formatDateKey(new Date())) {
        return "GAME TODAY: SUB NEEDED";
      }
      return "No selection";
  }
}

export function getStatusPillClasses(statusLabel) {
  if (statusLabel === "GAME TODAY: SUB NEEDED") {
    return "bg-rose-100 text-rose-800 ring-rose-200";
  }
  if (statusLabel.startsWith("IN")) {
    return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  }
  if (statusLabel.startsWith("OUT")) {
    return "bg-amber-100 text-amber-800 ring-amber-200";
  }
  if (statusLabel.startsWith("Pending")) {
    return "bg-slate-100 text-slate-700 ring-slate-200";
  }
  if (statusLabel.toLowerCase().includes("sub")) {
    if (statusLabel.toLowerCase().includes("filled")) {
      return "bg-slate-100 text-slate-700 ring-slate-200";
    }
    return "bg-sky-100 text-sky-800 ring-sky-200";
  }
  if (statusLabel.startsWith("Action Required")) {
    return "bg-rose-100 text-rose-800 ring-rose-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function getCountdownText(game) {
  const gameDate = parseGameDate(game);
  if (!gameDate) {
    return "";
  }

  const now = new Date();
  const diffMs = gameDate.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const mins = Math.floor(absMs / 60000);
  const days = Math.floor(mins / (60 * 24));
  const hours = Math.floor((mins % (60 * 24)) / 60);
  const minutes = mins % 60;

  let unitText = "";
  if (days > 0) {
    unitText = `${days}d ${hours}h`;
  } else if (hours > 0) {
    unitText = `${hours}h ${minutes}m`;
  } else {
    unitText = `${minutes}m`;
  }

  return diffMs >= 0 ? `in ${unitText}` : `${unitText} ago`;
}

export function groupGamesByDate(games) {
  const buckets = new Map();

  for (const game of games) {
    const key = getGameDateKey(game);
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(game);
  }

  return [...buckets.entries()]
    .sort((a, b) => {
      const aTs = getGameTimestamp(a[1][0]);
      const bTs = getGameTimestamp(b[1][0]);
      if (aTs === null && bTs === null) {
        return a[0].localeCompare(b[0]);
      }
      if (aTs === null) {
        return 1;
      }
      if (bTs === null) {
        return -1;
      }
      return aTs - bTs;
    })
    .map(([key, groupedGames]) => ({
      key,
      label: formatDateLabel(groupedGames[0]),
      games: groupedGames
    }));
}

export function buildUpcomingWeekBuckets(games, totalDays = 14) {
  const start = startOfDay(new Date());
  const end = addDays(start, Math.max(0, totalDays - 1));
  const days = [];

  let cursor = new Date(start);
  while (cursor <= end) {
    days.push({
      key: formatDateKey(cursor),
      label: formatPlannerLabel(cursor),
      date: new Date(cursor),
      games: []
    });
    cursor = addDays(cursor, 1);
  }

  const byKey = new Map(days.map((day) => [day.key, day]));
  for (const game of games) {
    const key = getGameDateKey(game);
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.games.push(game);
    }
  }

  for (const day of days) {
    day.games.sort((a, b) => {
      const aTs = getGameTimestamp(a) || 0;
      const bTs = getGameTimestamp(b) || 0;
      return aTs - bTs;
    });
  }

  return days;
}

export function buildPlannerBuckets(games, maxDays = 14) {
  const sorted = [...games]
    .map((game) => ({ game, ts: getGameTimestamp(game) }))
    .filter((entry) => entry.ts !== null)
    .sort((a, b) => a.ts - b.ts);

  const today = startOfDay(new Date());
  let start = today;
  let end = addDays(today, Math.max(0, maxDays - 1));

  if (sorted.length > 0) {
    const earliest = startOfDay(new Date(sorted[0].ts));
    const latest = startOfDay(new Date(sorted[sorted.length - 1].ts));
    start = earliest < today ? earliest : today;
    end = latest > end ? latest : end;
  }

  const days = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    days.push({
      key: formatDateKey(cursor),
      label: formatPlannerLabel(cursor),
      date: new Date(cursor),
      games: []
    });
    cursor = addDays(cursor, 1);
  }

  const byKey = new Map(days.map((day) => [day.key, day]));
  for (const game of games) {
    const key = getGameDateKey(game);
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.games.push(game);
    }
  }

  for (const day of days) {
    day.games.sort((a, b) => {
      const aTs = getGameTimestamp(a) || 0;
      const bTs = getGameTimestamp(b) || 0;
      return aTs - bTs;
    });
  }

  return days;
}

function getGameDateKey(game) {
  return game?.schedule?.date || "unknown-date";
}

function formatDateLabel(game) {
  const date = game?.schedule?.date;
  const day = game?.schedule?.day;
  if (date && day) {
    return `${day} ${date}`;
  }
  if (date) {
    return date;
  }
  return "Unknown date";
}

function getGameTimestamp(game) {
  const parsed = parseGameDate(game);
  return parsed ? parsed.getTime() : null;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date, days) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    0,
    0,
    0,
    0
  );
}

export function checkIsProcessed(game, selection) {
  if (selection === "IN") {
    return game.selected === "IN" || game.stage === "confirmed-in";
  }
  if (selection === "OUT") {
    return game.selected === "OUT" || game.stage === "out";
  }
  if (selection === "SUB") {
    return game.selected === "SUB" || game.stage === "sub-requested";
  }
  if (selection === "") {
    return game.stage !== "out" && game.selected !== "OUT" && game.stage !== "sub-requested" && game.selected !== "SUB";
  }
  return false;
}

export function applyPendingUpdate(game, selection) {
  const updated = { ...game };
  if (selection === "IN") {
    updated.selected = "IN";
    updated.stage = "confirmed-in";
  } else if (selection === "OUT") {
    updated.selected = "OUT";
    updated.stage = "out";
    updated.details = {
      ...updated.details,
      note: "You are not available"
    };
  } else if (selection === "SUB") {
    updated.selected = "SUB";
    updated.stage = "sub-requested";
    const originalNote = String(updated.details?.note || "");
    const prefixMatch = originalNote.match(/^(.*?sub\.)/i);
    const prefix = prefixMatch ? prefixMatch[1] + " " : "";
    updated.details = {
      ...updated.details,
      note: prefix
    };
  } else if (selection === "") {
    updated.selected = "";
    if (updated.stage === "out" || updated.stage === "sub-requested") {
      updated.stage = "available";
      
      // Preserve the original prefix (e.g., "goalie sub.") if it exists
      const originalNote = String(game?.details?.note || "");
      const prefixMatch = originalNote.match(/^(.*?sub\.)/i);
      const prefix = prefixMatch ? prefixMatch[1] + " " : "";

      updated.details = {
        ...updated.details,
        note: prefix + "Sub spot needed"
      };
      
      // Restore the SUB and OUT options so the buttons reappear
      if (!updated.options) updated.options = [];
      if (!updated.options.some(o => o.value === "SUB")) {
        updated.options.push({ value: "SUB", type: "checkbox", checked: false });
      }
      if (!updated.options.some(o => o.value === "OUT")) {
        updated.options.push({ value: "OUT", type: "radio", checked: false });
      }
    }
  }
  return updated;
}

export function formatDateKey(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function formatPlannerLabel(date) {
  const dayName = date.toLocaleDateString(undefined, { weekday: "short" });
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${dayName} ${month}/${day}`;
}

function parseGameDate(game) {
  const schedule = game?.schedule || {};
  const datePart = schedule.date;
  const timePart = schedule.time;
  if (!datePart || !timePart) {
    return null;
  }

  const dateMatch = String(datePart).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const timeMatch = String(timePart).match(/^(\d{1,2}):(\d{2})([AP])$/i);
  if (!dateMatch || !timeMatch) {
    return null;
  }

  const month = Number(dateMatch[1]) - 1;
  const day = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = timeMatch[3].toUpperCase();

  if (meridiem === "A" && hour === 12) {
    hour = 0;
  } else if (meridiem === "P" && hour < 12) {
    hour += 12;
  }

  const parsed = new Date(year, month, day, hour, minute, 0, 0);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function getRinkPillClasses(rink) {
  if (!rink) return "bg-slate-100 text-slate-700";
  const r = rink.toLowerCase();
  if (r.includes("red")) return "bg-rose-100 text-rose-800";
  if (r.includes("blue")) return "bg-blue-100 text-blue-800";
  if (r.includes("green")) return "bg-emerald-100 text-emerald-800";
  if (r.includes("south")) return "bg-amber-100 text-amber-800";
  if (r.includes("north")) return "bg-sky-100 text-sky-800";
  return "bg-slate-100 text-slate-700";
}

export function getGameStartDate(game) {
  return parseGameDate(game);
}

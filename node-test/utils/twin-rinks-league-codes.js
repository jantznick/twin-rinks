"use strict";

/**
 * Twin Rinks subs HTML uses short league codes in matchup lines (e.g. PLAT RED vs YELLOW)
 * and in schedule prefixes (e.g. PLAT-RED, RECS-GOLD). Map codes to display names.
 */
const TWIN_RINKS_LEAGUE_BY_CODE = {
  PLAT: "Platinum",
  PLATINUM: "Platinum",
  RECS: "Recreation",
  REC: "Recreation",
  LEIS: "Leisure",
  LEAS: "Leisure",
  LEISURE: "Leisure",
  BRON: "Bronze",
  BRNZ: "Bronze",
  BRONZE: "Bronze",
  SILV: "Silver",
  SLVR: "Silver",
  SILVER: "Silver",
  DIAM: "Diamond",
  DIAMOND: "Diamond",
  GOLD: "Gold"
};

function expandTwinRinksLeagueCode(raw) {
  const code = String(raw || "").trim().toUpperCase();
  if (!code) {
    return "";
  }
  if (Object.prototype.hasOwnProperty.call(TWIN_RINKS_LEAGUE_BY_CODE, code)) {
    return TWIN_RINKS_LEAGUE_BY_CODE[code];
  }
  return String(raw || "").trim();
}

module.exports = {
  expandTwinRinksLeagueCode,
  TWIN_RINKS_LEAGUE_BY_CODE
};

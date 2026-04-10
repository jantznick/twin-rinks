/**
 * Keep in sync with node-test/utils/twin-rinks-league-codes.js (Twin Rinks subs league abbreviations).
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

export function expandTwinRinksLeagueCode(raw) {
  const code = String(raw || "").trim().toUpperCase();
  if (!code) {
    return "";
  }
  if (Object.prototype.hasOwnProperty.call(TWIN_RINKS_LEAGUE_BY_CODE, code)) {
    return TWIN_RINKS_LEAGUE_BY_CODE[code];
  }
  return String(raw || "").trim();
}

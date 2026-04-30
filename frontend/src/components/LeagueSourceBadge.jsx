export default function LeagueSourceBadge({ game }) {
  if (game?.source === "sportsengine" && game.leagueLabel) {
    const label = String(game.leagueLabel).trim();
    const short = label.length > 40 ? `${label.slice(0, 38)}…` : label;
    return (
      <span
        title={label.length > 40 ? label : undefined}
        className="inline-flex max-w-[min(100%,14rem)] shrink-0 items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold leading-tight text-violet-900 ring-1 ring-violet-200/80"
      >
        {short}
      </span>
    );
  }
  if (game?.source === "twin-rinks-league") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-900 ring-1 ring-teal-200/80">
        My team (Twin Rinks)
      </span>
    );
  }
  if (game?.source === "twin-rinks-season") {
    const lg = String(game.seasonCalendarLeague || "").trim();
    const short = lg.length > 22 ? `${lg.slice(0, 20)}…` : lg;
    return (
      <span
        title={lg.length > 22 ? lg : undefined}
        className="inline-flex max-w-[min(100%,14rem)] shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold leading-tight text-amber-950 ring-1 ring-amber-200/90"
      >
        Season{short ? ` · ${short}` : ""}
      </span>
    );
  }
  return null;
}

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
  return null;
}

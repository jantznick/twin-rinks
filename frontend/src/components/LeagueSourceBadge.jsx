export default function LeagueSourceBadge({ game }) {
  if (game?.source === "rosemont") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900 ring-1 ring-violet-200/80">
        Rosemont AHL
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

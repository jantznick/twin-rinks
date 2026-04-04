export default function LeagueSourceBadge({ game }) {
  if (game?.source !== "rosemont") {
    return null;
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900 ring-1 ring-violet-200/80">
      Rosemont AHL
    </span>
  );
}

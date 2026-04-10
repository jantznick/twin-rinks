-- Migrate from TEXT[] URLs to JSON calendar entries with user-defined labels.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sportsengineCalendars" JSONB NOT NULL DEFAULT '[]';

UPDATE "User" u
SET "sportsengineCalendars" = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'url',
        x.url,
        'leagueLabel',
        'League schedule',
        'teamDisplayName',
        ''
      )
      ORDER BY x.idx
    ),
    '[]'::jsonb
  )
  FROM unnest(u."sportsengineCalendarUrls") WITH ORDINALITY AS x(url, idx)
)
WHERE cardinality(u."sportsengineCalendarUrls") > 0;

ALTER TABLE "User" DROP COLUMN "sportsengineCalendarUrls";

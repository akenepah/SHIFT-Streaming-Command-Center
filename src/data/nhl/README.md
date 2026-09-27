# NHL schedule dataset

`2026-27.json` is the complete 2026–27 NHL regular season, bundled with the app.
The app reads it through `StaticScheduleProvider` and never calls an NHL API at runtime.

| | |
|---|---|
| Season | 2026–27, regular season only (preseason and playoffs excluded) |
| Games | 1,344 (32 teams × 84 games) |
| Dates | 2026-09-29 → 2027-04-10 |
| Source | NHL public web API, `https://api-web.nhle.com/v1/schedule/{date}` |
| Retrieved | 2026-09-27 (exact timestamp in `meta.retrievedAt`) |

## Date convention

`date` is the NHL calendar date the game is listed under (`gameWeek[].date` in the
API response). It is never derived from `startTime`: a 7:30 pm Pacific game starts
the next day in UTC but still belongs to its listed date.

All dates in the app are `YYYY-MM-DD` strings. Date math runs in UTC on those strings
(`src/domain/dates.ts`), so the browser's time zone cannot move a game to another day.

## Refreshing

```bash
node scripts/fetch-nhl-schedule.mjs
npm test
```

The tests in `src/domain/schedule/schedule.test.ts` validate team codes, dates,
home ≠ away, one game per team per day, and per-team game counts.

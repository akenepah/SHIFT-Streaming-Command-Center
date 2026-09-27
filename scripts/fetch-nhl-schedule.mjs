#!/usr/bin/env node
/**
 * Development-time script: download the NHL regular-season schedule and save it
 * as a static dataset. The app never calls the NHL API at runtime.
 *
 *   node scripts/fetch-nhl-schedule.mjs [startDate]
 *
 * Source: https://api-web.nhle.com/v1/schedule/{date} (NHL's public web API).
 * Each response covers one week. `gameWeek[].date` is the NHL calendar date the
 * game is listed under, and that date is stored as-is (never derived from UTC).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEASON = 20262027;
const SEASON_LABEL = "2026-27";
const REGULAR_SEASON = 2;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/nhl/2026-27.json");
const API = "https://api-web.nhle.com/v1/schedule";

async function getWeek(date) {
  const res = await fetch(`${API}/${date}`);
  if (!res.ok) throw new Error(`${res.status} fetching ${date}`);
  return res.json();
}

const first = await getWeek(process.argv[2] ?? "2026-09-29");
const seasonStart = first.regularSeasonStartDate;
const seasonEnd = first.regularSeasonEndDate;

const games = new Map();
let cursor = seasonStart;
let data = await getWeek(cursor);
for (;;) {
  for (const day of data.gameWeek) {
    for (const g of day.games) {
      if (g.season !== SEASON || g.gameType !== REGULAR_SEASON) continue;
      games.set(String(g.id), {
        id: String(g.id),
        date: day.date,
        homeTeam: g.homeTeam.abbrev,
        awayTeam: g.awayTeam.abbrev,
        startTime: g.startTimeUTC,
      });
    }
  }
  const last = data.gameWeek.at(-1)?.date;
  if (!data.nextStartDate || !last || last >= seasonEnd) break;
  cursor = data.nextStartDate;
  data = await getWeek(cursor);
}

const sorted = [...games.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
const dataset = {
  meta: {
    season: SEASON_LABEL,
    gameType: "regular season",
    source: API,
    retrievedAt: new Date().toISOString(),
    regularSeasonStart: seasonStart,
    regularSeasonEnd: seasonEnd,
    gameCount: sorted.length,
    dateConvention: "date = NHL calendar date the game is listed under (gameWeek[].date), not derived from startTime",
  },
  games: sorted,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(dataset, null, 0).replace(/\},\{/g, "},\n{") + "\n");
console.log(`Saved ${sorted.length} games (${seasonStart} → ${seasonEnd}) to ${OUT}`);

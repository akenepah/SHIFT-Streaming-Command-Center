import { isValidISODate } from "../dates";
import { isNHLTeamId } from "../nhl/teamIds";
import type { ScheduleGame } from "../types";

export type ScheduleDataset = {
  meta: {
    season: string;
    source: string;
    retrievedAt: string;
    regularSeasonStart: string;
    regularSeasonEnd: string;
    gameCount: number;
  };
  games: ScheduleGame[];
};

/** Returns a list of problems; empty means the dataset is valid. */
export function validateSchedule(dataset: ScheduleDataset): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const teamDates = new Set<string>();

  dataset.games.forEach((g, i) => {
    const where = `game[${i}] ${g?.id ?? "?"}`;
    if (!g || typeof g.id !== "string" || !g.id) errors.push(`${where}: missing id`);
    else if (ids.has(g.id)) errors.push(`${where}: duplicate id`);
    else ids.add(g.id);

    if (!isValidISODate(g.date)) errors.push(`${where}: invalid date ${g.date}`);
    else if (g.date < dataset.meta.regularSeasonStart || g.date > dataset.meta.regularSeasonEnd)
      errors.push(`${where}: date ${g.date} outside the season`);

    if (!isNHLTeamId(g.homeTeam)) errors.push(`${where}: unknown home team ${g.homeTeam}`);
    if (!isNHLTeamId(g.awayTeam)) errors.push(`${where}: unknown away team ${g.awayTeam}`);
    if (g.homeTeam === g.awayTeam) errors.push(`${where}: home team equals away team`);

    for (const team of [g.homeTeam, g.awayTeam]) {
      const key = `${team}@${g.date}`;
      if (teamDates.has(key)) errors.push(`${where}: ${team} plays twice on ${g.date}`);
      teamDates.add(key);
    }
  });

  if (dataset.meta.gameCount !== dataset.games.length)
    errors.push(`meta.gameCount ${dataset.meta.gameCount} ≠ ${dataset.games.length} games`);
  return errors;
}

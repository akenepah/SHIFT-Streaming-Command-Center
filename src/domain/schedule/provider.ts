import type { ISODate, NHLTeamId, ScheduleGame } from "../types";

/**
 * Boundary between the planner and wherever schedule data comes from.
 * The planner only talks to this interface; the alpha ships a static
 * implementation, and a live NHL API provider can replace it later.
 */
export interface ScheduleProvider {
  getGamesForDate(date: ISODate): ScheduleGame[];
  /** Inclusive of both start and end. */
  getGamesForRange(start: ISODate, end: ISODate): ScheduleGame[];
  getTeamGames(teamId: NHLTeamId, start: ISODate, end: ISODate): ScheduleGame[];
}

/** In-memory provider over a list of games, indexed by date. */
export class InMemoryScheduleProvider implements ScheduleProvider {
  private readonly byDate = new Map<ISODate, ScheduleGame[]>();
  private readonly sortedDates: ISODate[];

  constructor(games: readonly ScheduleGame[]) {
    for (const game of games) {
      const list = this.byDate.get(game.date);
      if (list) list.push(game);
      else this.byDate.set(game.date, [game]);
    }
    for (const list of this.byDate.values()) {
      list.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.id.localeCompare(b.id));
    }
    this.sortedDates = [...this.byDate.keys()].sort();
  }

  getGamesForDate(date: ISODate): ScheduleGame[] {
    return [...(this.byDate.get(date) ?? [])];
  }

  getGamesForRange(start: ISODate, end: ISODate): ScheduleGame[] {
    const out: ScheduleGame[] = [];
    for (const date of this.sortedDates) {
      if (date < start) continue;
      if (date > end) break;
      out.push(...this.byDate.get(date)!);
    }
    return out;
  }

  getTeamGames(teamId: NHLTeamId, start: ISODate, end: ISODate): ScheduleGame[] {
    return this.getGamesForRange(start, end).filter(
      (g) => g.homeTeam === teamId || g.awayTeam === teamId,
    );
  }
}

/** The game a team plays on a date, if any. */
export function findTeamGame(
  provider: ScheduleProvider,
  teamId: NHLTeamId,
  date: ISODate,
): ScheduleGame | undefined {
  return provider.getGamesForDate(date).find((g) => g.homeTeam === teamId || g.awayTeam === teamId);
}

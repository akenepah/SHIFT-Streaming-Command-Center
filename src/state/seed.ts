import { DEFAULT_LEAGUE_SETTINGS } from "@/domain/config";
import type { Player, Position, RosterPlayer, RosterStatus } from "@/domain/types";
import type { NHLTeamId } from "@/domain/nhl/teams";
import { APP_STATE_VERSION, type AppState } from "./appState";

/**
 * Sample data so the planner works on first launch. Teams reflect the
 * preseason picture; edit any player's team from the Roster screen, or
 * reset to an empty roster and build your own.
 */
const SEED: [id: string, name: string, team: NHLTeamId, positions: Position[], status?: RosterStatus][] = [
  ["seed-mcdavid", "Connor McDavid", "EDM", ["C"], "ACTIVE"],
  ["seed-mackinnon", "Nathan MacKinnon", "COL", ["C"], "ACTIVE"],
  ["seed-matthews", "Auston Matthews", "TOR", ["C"], "ACTIVE"],
  ["seed-draisaitl", "Leon Draisaitl", "EDM", ["C", "LW"], "ACTIVE"],
  ["seed-kaprizov", "Kirill Kaprizov", "MIN", ["LW"], "ACTIVE"],
  ["seed-malkin", "Evgeni Malkin", "PIT", ["C", "LW"], "ACTIVE"],
  ["seed-kucherov", "Nikita Kucherov", "TBL", ["RW"], "ACTIVE"],
  ["seed-pastrnak", "David Pastrnak", "BOS", ["RW"], "ACTIVE"],
  ["seed-rantanen", "Mikko Rantanen", "DAL", ["LW", "RW"], "ACTIVE"],
  ["seed-makar", "Cale Makar", "COL", ["D"], "ACTIVE"],
  ["seed-fox", "Adam Fox", "NYR", ["D"], "ACTIVE"],
  ["seed-josi", "Roman Josi", "NSH", ["D"], "ACTIVE"],
  ["seed-bouchard", "Evan Bouchard", "EDM", ["D"], "ACTIVE"],
  ["seed-jhughes", "Jack Hughes", "NJD", ["C"], "ACTIVE"],
  ["seed-hellebuyck", "Connor Hellebuyck", "WPG", ["G"], "ACTIVE"],
  ["seed-wright", "Shane Wright", "SEA", ["C", "RW"], "BENCH"],
  ["seed-leonard", "Ryan Leonard", "WSH", ["RW"], "BENCH"],
  ["seed-mctavish", "Mason McTavish", "ANA", ["C", "LW"], "BENCH"],
  ["seed-shesterkin", "Igor Shesterkin", "NYR", ["G"], "BENCH"],
  // Not rostered: available to plan Adds with.
  ["seed-aho", "Sebastian Aho", "CAR", ["C"]],
  ["seed-vasilevskiy", "Andrei Vasilevskiy", "TBL", ["G"]],
  ["seed-celebrini", "Macklin Celebrini", "SJS", ["C"]],
  ["seed-michkov", "Matvei Michkov", "PHI", ["RW"]],
  ["seed-hutson", "Lane Hutson", "MTL", ["D"]],
];

export function seedPlayers(): Record<string, Player> {
  return Object.fromEntries(
    SEED.map(([id, name, nhlTeamId, eligiblePositions]) => [id, { id, name, nhlTeamId, eligiblePositions }]),
  );
}

export function seedRoster(): RosterPlayer[] {
  return SEED.filter((s) => s[4]).map(([playerId, , , , rosterStatus]) => ({ playerId, rosterStatus: rosterStatus! }));
}

/** Fresh state with the sample roster. */
export function createSeedState(): AppState {
  return {
    version: APP_STATE_VERSION,
    settings: structuredClone(DEFAULT_LEAGUE_SETTINGS),
    players: seedPlayers(),
    roster: seedRoster(),
    transactions: [],
    overrides: [],
    setupComplete: false,
  };
}

/** Fresh state with no roster (seed players stay in the registry to pick from). */
export function createEmptyState(): AppState {
  return { ...createSeedState(), roster: [] };
}

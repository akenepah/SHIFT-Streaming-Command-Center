import type { NHLTeamId } from "@/domain/nhl/teamIds";
import type { Player, Position, RosterStatus } from "@/domain/types";

/**
 * The sample roster the first private-alpha build (schema v1) seeded into every
 * browser. It exists only so that data can be recognized and removed. Nothing
 * in the app seeds it any more.
 */
export const LEGACY_DEMO_PLAYERS: readonly (Player & { rosterStatus?: RosterStatus })[] = (
  [
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
    ["seed-aho", "Sebastian Aho", "CAR", ["C"]],
    ["seed-vasilevskiy", "Andrei Vasilevskiy", "TBL", ["G"]],
    ["seed-celebrini", "Macklin Celebrini", "SJS", ["C"]],
    ["seed-michkov", "Matvei Michkov", "PHI", ["RW"]],
    ["seed-hutson", "Lane Hutson", "MTL", ["D"]],
  ] as [string, string, NHLTeamId, Position[], RosterStatus?][]
).map(([id, name, nhlTeamId, eligiblePositions, rosterStatus]) => ({
  id,
  name,
  nhlTeamId,
  eligiblePositions,
  ...(rosterStatus ? { rosterStatus } : {}),
}));

const BY_ID = new Map(LEGACY_DEMO_PLAYERS.map((p) => [p.id, p]));

/**
 * True when a stored (raw v1) player record is exactly one of the legacy sample
 * players, never edited. A sample player the user changed (team, positions,
 * name, headshot) counts as the user's own data and is kept.
 */
export function isUntouchedDemoPlayer(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const p = raw as Partial<Player> & { custom?: unknown };
  const seed = typeof p.id === "string" ? BY_ID.get(p.id) : undefined;
  if (!seed || p.custom === true || p.headshot) return false;
  return (
    p.name === seed.name &&
    p.nhlTeamId === seed.nhlTeamId &&
    Array.isArray(p.eligiblePositions) &&
    p.eligiblePositions.length === seed.eligiblePositions.length &&
    p.eligiblePositions.every((pos, i) => pos === seed.eligiblePositions[i])
  );
}

/** The exact v1 payload a browser had right after the old seeded first launch (used in tests). */
export function legacyDemoV1Payload() {
  return {
    version: 1,
    settings: {
      leagueName: "My League",
      teamName: "My Team",
      season: "2026-27",
      roster: { slots: { C: 3, LW: 3, RW: 3, D: 4, UTIL: 1, G: 1 }, benchSlots: 5, irPlusSlots: 4 },
      weeklyAcquisitionLimit: 6,
      weekStartsOn: 1,
      minGoalieAppearances: 3,
    },
    players: Object.fromEntries(
      LEGACY_DEMO_PLAYERS.map(({ rosterStatus: _status, ...p }) => {
        void _status;
        return [p.id, p];
      }),
    ),
    roster: LEGACY_DEMO_PLAYERS.filter((p) => p.rosterStatus).map((p) => ({ playerId: p.id, rosterStatus: p.rosterStatus })),
    transactions: [],
    overrides: [],
    setupComplete: false,
  };
}

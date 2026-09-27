export const NHL_TEAM_IDS = [
  "ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL",
  "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NJD",
  "NSH", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJS",
  "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG", "WSH",
] as const;

export type NHLTeamId = (typeof NHL_TEAM_IDS)[number];

export function isNHLTeamId(value: unknown): value is NHLTeamId {
  return typeof value === "string" && (NHL_TEAM_IDS as readonly string[]).includes(value);
}

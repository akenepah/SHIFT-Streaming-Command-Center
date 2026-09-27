import { NHL_TEAM_IDS, type NHLTeamId } from "./teamIds";

export { NHL_TEAM_IDS, isNHLTeamId, type NHLTeamId } from "./teamIds";

export type NHLTeam = {
  id: NHLTeamId;
  city: string;
  name: string;
  /** Primary brand color, used for small team chips. */
  color: string;
};

/** The one canonical NHL team registry. Look team details up here, nowhere else. */
export const NHL_TEAMS: Readonly<Record<NHLTeamId, NHLTeam>> = {
  ANA: { id: "ANA", city: "Anaheim", name: "Ducks", color: "#F47A38" },
  BOS: { id: "BOS", city: "Boston", name: "Bruins", color: "#FFB81C" },
  BUF: { id: "BUF", city: "Buffalo", name: "Sabres", color: "#003087" },
  CAR: { id: "CAR", city: "Carolina", name: "Hurricanes", color: "#CE1126" },
  CBJ: { id: "CBJ", city: "Columbus", name: "Blue Jackets", color: "#002654" },
  CGY: { id: "CGY", city: "Calgary", name: "Flames", color: "#C8102E" },
  CHI: { id: "CHI", city: "Chicago", name: "Blackhawks", color: "#CF0A2C" },
  COL: { id: "COL", city: "Colorado", name: "Avalanche", color: "#6F263D" },
  DAL: { id: "DAL", city: "Dallas", name: "Stars", color: "#006847" },
  DET: { id: "DET", city: "Detroit", name: "Red Wings", color: "#CE1126" },
  EDM: { id: "EDM", city: "Edmonton", name: "Oilers", color: "#FF4C00" },
  FLA: { id: "FLA", city: "Florida", name: "Panthers", color: "#C8102E" },
  LAK: { id: "LAK", city: "Los Angeles", name: "Kings", color: "#A2AAAD" },
  MIN: { id: "MIN", city: "Minnesota", name: "Wild", color: "#154734" },
  MTL: { id: "MTL", city: "Montréal", name: "Canadiens", color: "#AF1E2D" },
  NJD: { id: "NJD", city: "New Jersey", name: "Devils", color: "#CE1126" },
  NSH: { id: "NSH", city: "Nashville", name: "Predators", color: "#FFB81C" },
  NYI: { id: "NYI", city: "New York", name: "Islanders", color: "#00539B" },
  NYR: { id: "NYR", city: "New York", name: "Rangers", color: "#0038A8" },
  OTT: { id: "OTT", city: "Ottawa", name: "Senators", color: "#DA1A32" },
  PHI: { id: "PHI", city: "Philadelphia", name: "Flyers", color: "#F74902" },
  PIT: { id: "PIT", city: "Pittsburgh", name: "Penguins", color: "#FCB514" },
  SEA: { id: "SEA", city: "Seattle", name: "Kraken", color: "#99D9D9" },
  SJS: { id: "SJS", city: "San Jose", name: "Sharks", color: "#006D75" },
  STL: { id: "STL", city: "St. Louis", name: "Blues", color: "#002F87" },
  TBL: { id: "TBL", city: "Tampa Bay", name: "Lightning", color: "#002868" },
  TOR: { id: "TOR", city: "Toronto", name: "Maple Leafs", color: "#00205B" },
  UTA: { id: "UTA", city: "Utah", name: "Mammoth", color: "#6CACE4" },
  VAN: { id: "VAN", city: "Vancouver", name: "Canucks", color: "#00843D" },
  VGK: { id: "VGK", city: "Vegas", name: "Golden Knights", color: "#B4975A" },
  WPG: { id: "WPG", city: "Winnipeg", name: "Jets", color: "#041E42" },
  WSH: { id: "WSH", city: "Washington", name: "Capitals", color: "#C8102E" },
};

export function getTeam(id: NHLTeamId): NHLTeam {
  return NHL_TEAMS[id];
}

export function teamFullName(id: NHLTeamId): string {
  const t = NHL_TEAMS[id];
  return `${t.city} ${t.name}`;
}

export const TEAMS_SORTED: readonly NHLTeam[] = NHL_TEAM_IDS.map((id) => NHL_TEAMS[id]).sort((a, b) =>
  teamFullName(a.id).localeCompare(teamFullName(b.id)),
);

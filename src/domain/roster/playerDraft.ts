import { isNHLTeamId, type NHLTeamId } from "../nhl/teamIds";
import { POSITIONS, type Player, type Position } from "../types";

export type PlayerDraft = {
  name: string;
  nhlTeamId: NHLTeamId | "";
  eligiblePositions: Position[];
  headshot: string;
};

export function emptyPlayerDraft(): PlayerDraft {
  return { name: "", nhlTeamId: "", eligiblePositions: [], headshot: "" };
}

/** Start a draft from a stored record that failed validation, keeping whatever is usable. */
export function draftFromRepair(r: { name: string; nhlTeamId: string; eligiblePositions: string[] }): PlayerDraft {
  return {
    name: r.name === "Unnamed player" ? "" : r.name,
    nhlTeamId: isNHLTeamId(r.nhlTeamId) ? r.nhlTeamId : "",
    eligiblePositions: [...new Set(r.eligiblePositions.filter((p): p is Position => POSITIONS.includes(p as Position)))],
    headshot: "",
  };
}

export function draftFromPlayer(p: Player): PlayerDraft {
  return { name: p.name, nhlTeamId: p.nhlTeamId, eligiblePositions: [...p.eligiblePositions], headshot: p.headshot ?? "" };
}

export function validatePlayerDraft(d: PlayerDraft): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push("Enter the player's name.");
  if (!isNHLTeamId(d.nhlTeamId)) errors.push("Choose an NHL team.");
  if (!d.eligiblePositions.length) errors.push("Choose at least one position.");
  if (d.eligiblePositions.some((p) => !POSITIONS.includes(p))) errors.push("Positions must be C, LW, RW, D or G.");
  if (new Set(d.eligiblePositions).size !== d.eligiblePositions.length) errors.push("Each position can only be listed once.");
  if (d.eligiblePositions.includes("G") && d.eligiblePositions.length > 1)
    errors.push("A goalie can't also have skater positions.");
  if (d.headshot.trim() && !/^https?:\/\//i.test(d.headshot.trim())) errors.push("Headshot must be an http(s) URL.");
  return errors;
}

/** Build a Player from a valid draft. Positions are stored in canonical order. */
export function playerFromDraft(d: PlayerDraft, id: string, custom: boolean): Player {
  const headshot = d.headshot.trim();
  return {
    id,
    name: d.name.trim().replace(/\s+/g, " "),
    nhlTeamId: d.nhlTeamId as NHLTeamId,
    eligiblePositions: POSITIONS.filter((p) => d.eligiblePositions.includes(p)),
    ...(headshot ? { headshot } : {}),
    ...(custom ? { custom: true } : {}),
  };
}

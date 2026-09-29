import { describe, expect, it } from "vitest";
import { emptyPlayerDraft, playerFromDraft, validatePlayerDraft } from "./playerDraft";

describe("player drafts", () => {
  it("requires name, team and a position", () => {
    expect(validatePlayerDraft(emptyPlayerDraft())).toHaveLength(3);
  });

  it("allows creating a player without a headshot", () => {
    const d = { name: "  Ryan   Leonard ", nhlTeamId: "WSH" as const, eligiblePositions: ["RW" as const], headshot: "" };
    expect(validatePlayerDraft(d)).toEqual([]);
    expect(playerFromDraft(d, "p1")).toEqual({
      id: "p1",
      name: "Ryan Leonard",
      nhlTeamId: "WSH",
      eligiblePositions: ["RW"],
      nhlPlayerId: null,
      source: "CUSTOM",
      eligibilitySource: "USER",
    });
  });

  it("stores multi-position eligibility in canonical order", () => {
    const d = { name: "Shane Wright", nhlTeamId: "SEA" as const, eligiblePositions: ["RW" as const, "C" as const], headshot: "" };
    expect(playerFromDraft(d, "p2").eligiblePositions).toEqual(["C", "RW"]);
  });

  it("rejects goalie + skater combinations and non-URL headshots", () => {
    const d = { name: "X", nhlTeamId: "BOS" as const, eligiblePositions: ["G" as const, "C" as const], headshot: "file.png" };
    expect(validatePlayerDraft(d)).toHaveLength(2);
  });
});

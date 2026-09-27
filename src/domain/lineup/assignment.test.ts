import { describe, expect, it } from "vitest";
import { buildSlots } from "../config";
import { slotsConfig } from "../testing/fixtures";
import type { Position } from "../types";
import { assignMaximumStarts } from "./assignment";

/** Brute-force maximum number of starters, for cross-checking. */
function bruteForceMax(positions: Position[][], slotTypes: string[]): number {
  const accepts = (slot: string, p: Position) => (slot === "UTIL" ? p !== "G" : slot === p);
  let best = 0;
  const used = new Array(slotTypes.length).fill(false);
  const go = (i: number, count: number) => {
    if (count + (positions.length - i) <= best) return;
    if (i === positions.length) {
      best = Math.max(best, count);
      return;
    }
    go(i + 1, count);
    for (let s = 0; s < slotTypes.length; s++) {
      if (!used[s] && positions[i].some((p) => accepts(slotTypes[s], p))) {
        used[s] = true;
        go(i + 1, count + 1);
        used[s] = false;
      }
    }
  };
  go(0, 0);
  return best;
}

describe("assignMaximumStarts", () => {
  it("matches brute force on randomized rosters", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const all: Position[] = ["C", "LW", "RW", "D", "G"];
    const config = slotsConfig({ C: 2, LW: 2, RW: 1, D: 2, UTIL: 1, G: 1 });
    const slots = buildSlots(config);

    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + Math.floor(rand() * 11);
      const positions: Position[][] = Array.from({ length: n }, () => {
        const first = all[Math.floor(rand() * all.length)];
        if (first === "G" || rand() < 0.5) return [first];
        const second = (["C", "LW", "RW"] as Position[])[Math.floor(rand() * 3)];
        return [...new Set([first, second])];
      });
      const result = assignMaximumStarts(
        positions.map((p, i) => ({ playerId: `p${i}`, positions: p })),
        slots,
      );
      expect(result.size).toBe(bruteForceMax(positions, slots.map((s) => s.type)));
    }
  });

  it("is deterministic", () => {
    const slots = buildSlots(slotsConfig({ C: 1, LW: 1, RW: 1, UTIL: 1 }));
    const candidates = [
      { playerId: "a", positions: ["C", "LW"] as Position[] },
      { playerId: "b", positions: ["LW", "RW"] as Position[] },
      { playerId: "c", positions: ["C"] as Position[] },
    ];
    const first = [...assignMaximumStarts(candidates, slots)];
    for (let i = 0; i < 5; i++) expect([...assignMaximumStarts(candidates, slots)]).toEqual(first);
  });

  it("skips blocked slots", () => {
    const slots = buildSlots(slotsConfig({ C: 1, UTIL: 1 }));
    const result = assignMaximumStarts([{ playerId: "a", positions: ["C"] }], slots, new Set(["C1"]));
    expect([...result]).toEqual([["UTIL1", "a"]]);
  });
});

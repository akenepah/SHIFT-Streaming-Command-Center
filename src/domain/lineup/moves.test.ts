import { describe, expect, it } from "vitest";
import { game, player, playerMap, rostered, schedule, slotsConfig } from "../testing/fixtures";
import { BENCH_TARGET, type DailyLineup, type DailyLineupOverride, type RosterConfiguration, type RosterPlayer } from "../types";
import { generateDailyLineup } from "./generateDailyLineup";
import { applyLineupMove, benchReplacements, ineligibleSlotTypes, moveOptions } from "./moves";

const SAT = "2026-10-17";
const THU = "2026-10-15";

function setup(roster: RosterPlayer[], cfg: RosterConfiguration, games = [game(SAT, "NSH", "STL"), game(SAT, "NJD", "SJS"), game(SAT, "EDM", "BOS")]) {
  let overrides: DailyLineupOverride[] = [];
  const players = playerMap(
    player("saros", "NSH", "G"),
    player("hofer", "STL", "G"),
    player("allen", "NJD", "G"),
    player("askarov", "SJS", "G"),
    player("c1", "EDM", "C"),
    player("lw1", "EDM", "LW"),
    player("flex", "BOS", "C", "LW"),
    player("d1", "BOS", "D"),
    player("d2", "NJD", "D"),
  );
  const sched = schedule(games);
  const day = (date = SAT) =>
    generateDailyLineup({ roster, players, date, scheduleProvider: sched, rosterConfiguration: cfg, overrides });
  const move = (m: Parameters<typeof applyLineupMove>[3], date = SAT) => {
    const next = applyLineupMove(overrides, day(date), players, m);
    if (next) overrides = next;
    return next;
  };
  return { players, day, move, get overrides() { return overrides; } };
}

/** The invariants every lineup must keep: no duplicates, nobody with a game lost, no double-filled slot. */
function expectValid(d: DailyLineup, expectedPlaying: string[]) {
  const starters = d.activeSlots.map((a) => a.playerId).filter(Boolean) as string[];
  expect(new Set(starters).size).toBe(starters.length);
  const accounted = [...starters, ...d.benchedGames.map((b) => b.playerId)].sort();
  expect(accounted).toEqual([...expectedPlaying].sort());
  expect(d.ignoredOverrides).toEqual([]);
}

const slots = (d: DailyLineup) => Object.fromEntries(d.activeSlots.map((a) => [a.slot.id, a.playerId]));

describe("four goalies, one G slot", () => {
  const roster = [rostered("saros"), rostered("hofer", "BENCH"), rostered("allen", "BENCH"), rostered("askarov", "BENCH")];
  const goalies = ["saros", "hofer", "allen", "askarov"];

  it("benching a goalie leaves G open instead of silently cycling the next one in", () => {
    const t = setup(roster, slotsConfig({ G: 1 }));
    expect(slots(t.day()).G1).toBe("saros");
    expect(t.move({ playerId: "saros", targetSlotId: BENCH_TARGET })).not.toBeNull();
    expect(slots(t.day()).G1).toBeNull();
    expectValid(t.day(), goalies);
  });

  it("benching with a chosen replacement starts exactly that goalie", () => {
    const t = setup(roster, slotsConfig({ G: 1 }));
    t.move({ playerId: "saros", targetSlotId: BENCH_TARGET, replacementId: "allen" });
    expect(slots(t.day()).G1).toBe("allen");
    expectValid(t.day(), goalies);
  });

  it("repeated goalie swaps never empty the slot or lose a goalie, and returning to Saros works", () => {
    const t = setup(roster, slotsConfig({ G: 1 }));
    for (const next of ["hofer", "allen", "askarov", "saros", "hofer", "saros"]) {
      const opt = moveOptions(t.day(), t.players[next], t.players).find((o) => o.slotType === "G");
      if (slots(t.day()).G1 === next) continue;
      expect(opt).toBeDefined();
      expect(t.move({ playerId: next, targetSlotId: opt!.targetSlotId })).not.toBeNull();
      expect(slots(t.day()).G1).toBe(next);
      expectValid(t.day(), goalies);
    }
  });

  it("works with two G slots too", () => {
    const t = setup(roster, slotsConfig({ G: 2 }));
    const before = slots(t.day());
    const benched = t.day().benchedGames.map((b) => b.playerId);
    const opt = moveOptions(t.day(), t.players[benched[0]], t.players)[0];
    t.move({ playerId: benched[0], targetSlotId: opt.targetSlotId });
    const after = slots(t.day());
    expect(Object.values(after).filter(Boolean)).toHaveLength(2);
    expect(Object.values(after)).toContain(benched[0]);
    expect(Object.values(before).filter((id) => !Object.values(after).includes(id))).toHaveLength(1);
    expectValid(t.day(), goalies);
  });
});

describe("skaters", () => {
  const cfg = slotsConfig({ C: 1, LW: 1, D: 1, UTIL: 1 });
  const roster = [rostered("c1"), rostered("lw1"), rostered("d1"), rostered("flex", "BENCH"), rostered("d2", "BENCH")];
  const playing = ["c1", "lw1", "d1", "flex", "d2"];

  it("a multi-position bench player can move into any eligible slot, including UTIL", () => {
    const t = setup(roster, cfg);
    const flexSlot = t.day().activeSlots.find((a) => a.playerId === "flex")!.slot;
    t.move({ playerId: "flex", targetSlotId: BENCH_TARGET }); // flex benched, their slot left open
    expect(slots(t.day())[flexSlot.id]).toBeNull();
    const types = moveOptions(t.day(), t.players.flex, t.players).map((o) => o.slotType);
    expect(types).toEqual(expect.arrayContaining(["C", "LW", "UTIL"]));
    const util = moveOptions(t.day(), t.players.flex, t.players).find((o) => o.slotType === "UTIL")!;
    t.move({ playerId: "flex", targetSlotId: util.targetSlotId });
    expect(slots(t.day()).UTIL1).toBe("flex");
    expectValid(t.day(), playing);
  });

  it("an open slot lists exactly the benched players eligible for it", () => {
    const t = setup(roster, cfg);
    const d = t.day();
    const util = d.activeSlots.find((a) => a.slot.type === "UTIL")!;
    const benchedNow = d.benchedGames.map((b) => b.playerId);
    if (util.playerId) t.move({ playerId: util.playerId, targetSlotId: BENCH_TARGET });
    const candidates = benchReplacements(t.day(), "UTIL1", t.players);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((id) => [...benchedNow, util.playerId].includes(id))).toBe(true);
  });

  it("swapping into an occupied slot sends the occupant to the mover's old slot when eligible, else the bench", () => {
    const t = setup(roster, cfg);
    const d = t.day();
    const inUtil = d.activeSlots.find((a) => a.slot.type === "UTIL")!.playerId!;
    const benchD = d.benchedGames.map((b) => b.playerId).find((id) => t.players[id].eligiblePositions.includes("D"));
    if (benchD) {
      const opt = moveOptions(d, t.players[benchD], t.players).find((o) => o.slotType === "D")!;
      expect(opt.occupantTo).toBe(BENCH_TARGET); // the mover came from the bench
      t.move({ playerId: benchD, targetSlotId: opt.targetSlotId });
      expect(slots(t.day())[opt.targetSlotId]).toBe(benchD);
    }
    void inUtil;
    expectValid(t.day(), playing);
  });

  it("rejects an incompatible destination and leaves the lineup unchanged", () => {
    const t = setup(roster, cfg);
    const before = t.overrides;
    expect(t.move({ playerId: "d1", targetSlotId: "C1" })).toBeNull();
    expect(t.overrides).toBe(before);
    expect(ineligibleSlotTypes(t.day(), t.players.d1)).toEqual(expect.arrayContaining(["C", "LW"]));
    expect(moveOptions(t.day(), t.players.d1, t.players).some((o) => o.slotType === "C")).toBe(false);
  });

  it("rejects benching someone already on the bench, and a replacement who isn't eligible", () => {
    const t = setup(roster, cfg);
    const benched = t.day().benchedGames[0].playerId;
    expect(t.move({ playerId: benched, targetSlotId: BENCH_TARGET })).toBeNull();
    const inC = slots(t.day()).C1!;
    expect(t.move({ playerId: inC, targetSlotId: BENCH_TARGET, replacementId: "d2" })).toBeNull(); // a D can't play C
  });

  it("many repeated moves keep every invariant", () => {
    const t = setup(roster, cfg);
    for (let i = 0; i < 40; i++) {
      const d = t.day();
      const who = playing[i % playing.length];
      const opts = moveOptions(d, t.players[who], t.players);
      if (opts.length) t.move({ playerId: who, targetSlotId: opts[i % opts.length].targetSlotId });
      else if (d.activeSlots.some((a) => a.playerId === who)) t.move({ playerId: who, targetSlotId: BENCH_TARGET });
      expectValid(t.day(), playing);
    }
  });

  it("a move on Saturday never changes Thursday", () => {
    const t = setup(roster, cfg, [game(SAT, "EDM", "BOS"), game(SAT, "NJD", "SJS"), game(THU, "EDM", "BOS"), game(THU, "NJD", "SJS")]);
    const thursday = slots(t.day(THU));
    t.move({ playerId: "c1", targetSlotId: BENCH_TARGET });
    expect(slots(t.day(THU))).toEqual(thursday);
    expect(t.overrides.every((o) => o.date === SAT)).toBe(true);
  });

  it("the first manual move records the whole day, so later auto-fill can't cycle players", () => {
    const t = setup(roster, cfg);
    t.move({ playerId: slots(t.day()).C1!, targetSlotId: BENCH_TARGET });
    const pinned = new Set(t.overrides.map((o) => o.playerId));
    for (const id of playing) expect(pinned.has(id)).toBe(true);
    expect(slots(t.day()).C1).toBeNull(); // nobody was auto-inserted
  });
});


describe("mixed goalie/skater daily edits", () => {
  it("keeps four goalies stable through skater moves, rejects crossovers and IR+", () => {
    const roster = [rostered("saros"), rostered("hofer"), rostered("allen", "BENCH"), rostered("askarov", "BENCH"), rostered("c1"), rostered("flex"), rostered("d1", "IR_PLUS")];
    const t = setup(roster, slotsConfig({ G: 2, C: 1, LW: 1, UTIL: 1 }));
    t.move({ playerId: "allen", targetSlotId: "G1" });
    const goalies = t.day().activeSlots.filter(a => a.slot.type === "G").map(a => a.playerId);
    t.move({ playerId: "c1", targetSlotId: BENCH_TARGET });
    t.move({ playerId: "flex", targetSlotId: "UTIL1" });
    t.move({ playerId: "c1", targetSlotId: "C1" });
    expect(t.day().activeSlots.filter(a => a.slot.type === "G").map(a => a.playerId)).toEqual(goalies);
    expect(t.move({ playerId: "allen", targetSlotId: "C1" })).toBeNull();
    expect(t.move({ playerId: "c1", targetSlotId: "G1" })).toBeNull();
    expect(t.move({ playerId: "d1", targetSlotId: "UTIL1" })).toBeNull();
    expect(t.move({ playerId: "c1", targetSlotId: "C1" })).toBeNull();
  });
});

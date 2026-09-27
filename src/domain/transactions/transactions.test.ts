import { describe, expect, it } from "vitest";
import { generateWeek } from "../lineup/generateWeek";
import { game, player, playerMap, rostered, schedule, slotsConfig, tx } from "../testing/fixtures";
import { evaluateMoveImpact } from "./impact";
import {
  acquisitionCost,
  acquisitionsUsed,
  cancelTransaction,
  checkDraft,
  createTransaction,
  movesForWeek,
  updateTransaction,
} from "./transactions";

const WEEK = "2026-10-12";

describe("acquisition count", () => {
  it("counts DROP as 0", () => {
    expect(acquisitionCost("DROP")).toBe(0);
    expect(acquisitionsUsed([tx({ type: "DROP", dropPlayerId: "x", effectiveDate: "2026-10-14" })], WEEK)).toBe(0);
  });

  it("counts ADD as 1", () => {
    expect(acquisitionCost("ADD")).toBe(1);
    expect(acquisitionsUsed([tx({ type: "ADD", addPlayerId: "x", effectiveDate: "2026-10-14" })], WEEK)).toBe(1);
  });

  it("counts ADD + DROP as 1", () => {
    expect(acquisitionCost("ADD_DROP")).toBe(1);
    expect(
      acquisitionsUsed([tx({ type: "ADD_DROP", addPlayerId: "x", dropPlayerId: "y", effectiveDate: "2026-10-14" })], WEEK),
    ).toBe(1);
  });

  it("only counts planned moves inside the Monday–Sunday week", () => {
    const moves = [
      tx({ type: "ADD", addPlayerId: "a", effectiveDate: "2026-10-11" }), // previous Sunday
      tx({ type: "ADD", addPlayerId: "b", effectiveDate: "2026-10-12" }), // Monday
      tx({ type: "ADD", addPlayerId: "c", effectiveDate: "2026-10-18" }), // Sunday
      tx({ type: "ADD", addPlayerId: "d", effectiveDate: "2026-10-19" }), // next Monday
      tx({ type: "ADD", addPlayerId: "e", effectiveDate: "2026-10-15", status: "CANCELLED" }),
    ];
    expect(acquisitionsUsed(moves, WEEK)).toBe(2);
    expect(movesForWeek(moves, WEEK).map((t) => t.addPlayerId)).toEqual(["b", "c"]);
  });
});

describe("edit and cancel", () => {
  const original = createTransaction(
    { type: "ADD_DROP", addPlayerId: "aho", dropPlayerId: "mctavish", effectiveDate: "2026-10-15" },
    "t1",
    new Date("2026-10-10T12:00:00Z"),
  );

  it("creates a planned move", () => {
    expect(original).toMatchObject({ id: "t1", status: "PLANNED", type: "ADD_DROP", createdAt: "2026-10-10T12:00:00.000Z" });
  });

  it("edits a planned move and drops fields its new type doesn't use", () => {
    const [edited] = updateTransaction([original], "t1", { type: "ADD", addPlayerId: "aho", dropPlayerId: "mctavish", effectiveDate: "2026-10-16" });
    expect(edited).toMatchObject({ type: "ADD", addPlayerId: "aho", dropPlayerId: undefined, effectiveDate: "2026-10-16" });
  });

  it("cancels a planned move, which then stops counting and stops changing the roster", () => {
    const cancelled = cancelTransaction([original], "t1");
    expect(cancelled[0].status).toBe("CANCELLED");
    expect(acquisitionsUsed(cancelled, WEEK)).toBe(0);
  });
});

describe("checkDraft", () => {
  const ctx = {
    baseRoster: [rostered("mctavish"), rostered("keller")],
    transactions: [],
    weeklyAcquisitionLimit: 1,
    weekStartsOn: 1,
  };

  it("requires the players the move type needs", () => {
    expect(checkDraft({ type: "ADD_DROP", effectiveDate: "2026-10-15" }, ctx).errors).toHaveLength(2);
  });

  it("rejects adding a rostered player or dropping one who isn't", () => {
    const res = checkDraft({ type: "ADD_DROP", addPlayerId: "keller", dropPlayerId: "ghost", effectiveDate: "2026-10-15" }, ctx);
    expect(res.errors).toHaveLength(2);
  });

  it("checks against the roster projected by earlier moves", () => {
    const earlier = tx({ type: "DROP", dropPlayerId: "keller", effectiveDate: "2026-10-13" });
    const res = checkDraft(
      { type: "DROP", dropPlayerId: "keller", effectiveDate: "2026-10-15" },
      { ...ctx, transactions: [earlier] },
    );
    expect(res.errors).toEqual(["That player isn't on your roster on this date."]);
  });

  it("warns when the weekly acquisition limit would be exceeded", () => {
    const earlier = tx({ type: "ADD", addPlayerId: "x", effectiveDate: "2026-10-13" });
    const res = checkDraft(
      { type: "ADD", addPlayerId: "y", effectiveDate: "2026-10-15" },
      { ...ctx, transactions: [earlier] },
    );
    expect(res.errors).toEqual([]);
    expect(res.warnings).toHaveLength(1);
  });

  it("ignores the move being edited", () => {
    const self = tx({ type: "ADD", addPlayerId: "x", effectiveDate: "2026-10-13" });
    const res = checkDraft(
      { type: "ADD", addPlayerId: "x", effectiveDate: "2026-10-14" },
      { ...ctx, transactions: [self], editingId: self.id },
    );
    expect(res).toEqual({ errors: [], warnings: [] });
  });
});

describe("projected impact", () => {
  // BOS plays Mon/Wed/Fri; EDM plays Tue/Thu/Sat/Sun; ANA plays once.
  const sched = schedule([
    game("2026-10-12", "BOS", "NYR"),
    game("2026-10-13", "EDM", "CGY"),
    game("2026-10-14", "BOS", "TOR"),
    game("2026-10-15", "EDM", "VAN"),
    game("2026-10-16", "BOS", "MTL"),
    game("2026-10-17", "EDM", "SEA"),
    game("2026-10-18", "ANA", "EDM"),
  ]);
  const players = playerMap(player("bos", "BOS", "C"), player("edm", "EDM", "C"), player("ana", "ANA", "C"));
  const week = {
    weekStart: WEEK,
    roster: [rostered("bos"), rostered("ana")],
    players,
    scheduleProvider: sched,
    rosterConfiguration: slotsConfig({ C: 2 }),
  };

  it("shows added games when streaming into an open slot", () => {
    const impact = evaluateMoveImpact(
      week,
      tx({ type: "ADD_DROP", addPlayerId: "edm", dropPlayerId: "ana", effectiveDate: "2026-10-15" }),
    );
    // Before: bos 3 + ana 1 = 4. After: bos 3 + edm Thu/Sat/Sun 3 = 6.
    expect(impact.before.gamesStarted).toBe(4);
    expect(impact.after.gamesStarted).toBe(6);
    expect(impact.gamesStartedDelta).toBe(2);
  });

  it("only changes days on or after the effective date", () => {
    const plan = generateWeek({
      ...week,
      plannedTransactions: [tx({ type: "ADD_DROP", addPlayerId: "edm", dropPlayerId: "ana", effectiveDate: "2026-10-15" })],
    });
    expect(plan.days.map((d) => d.roster.map((r) => r.playerId).join())).toEqual([
      "bos,ana", "bos,ana", "bos,ana", "bos,edm", "bos,edm", "bos,edm", "bos,edm",
    ]);
  });
});

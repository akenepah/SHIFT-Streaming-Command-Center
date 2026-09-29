import { describe, expect, it } from "vitest";
import { generateWeek, type WeekInput } from "../lineup/generateWeek";
import { game, player, playerMap, rostered, schedule, slotsConfig, tx } from "../testing/fixtures";
import { getScheduleTargets, type ScheduleTarget } from "./scheduleTargets";

const mon = "2026-10-05", tue = "2026-10-06", wed = "2026-10-07", thu = "2026-10-08", fri = "2026-10-09", sat = "2026-10-10", sun = "2026-10-11";
function input(extra: Partial<WeekInput> = {}): WeekInput {
  return { weekStart: mon, roster: [], players: playerMap(player("van", "VAN", "LW"), player("car", "CAR", "C")),
    rosterConfiguration: slotsConfig({ C: 1, LW: 1 }), scheduleProvider: schedule([]), ...extra };
}
function targets(i: WeekInput, today = mon, timing: "TODAY" | "NEXT_DAY" = "TODAY", now = `${today}T00:00:00Z`) {
  return getScheduleTargets({ input: i, plan: generateWeek(i), today, timing, now });
}
function team(i: WeekInput, id = "VAN"): ScheduleTarget { return targets(i).targets.find(t => t.teamAbbrev === id)!; }

describe("Schedule Targets", () => {
  it("A: three useful games beat four games with one useful start", () => {
    const i = input({ roster: [rostered("c")], players: playerMap(player("c", "BOS", "C"), player("van", "VAN", "LW"), player("car", "CAR", "C")),
      scheduleProvider: schedule([game(mon,"CAR","BOS"), game(tue,"CAR","BOS"), game(thu,"CAR","BOS"), game(sun,"CAR","TOR"), game(wed,"VAN","NYR"), game(fri,"VAN","NYR"), game(sat,"VAN","NYR")]) });
    expect(targets(i).targets.map(t => [t.teamAbbrev,t.remainingGames,t.opportunityGames])).toEqual([["VAN",3,3],["CAR",4,1]]);
  });
  it("B: remaining games are secondary to equal opportunity counts", () => {
    const i = input({ roster: [rostered("wing")], players: playerMap(player("wing","BOS","LW"),player("van","VAN","LW"),player("car","CAR","C")),
      scheduleProvider: schedule([game(mon,"VAN","BOS"),game(tue,"VAN","TOR"),game(wed,"VAN","TOR"),game(tue,"CAR","NYR"),game(wed,"CAR","NYR")]) });
    expect(targets(i).targets[0]).toMatchObject({teamAbbrev:"VAN",opportunityGames:2,remainingGames:3});
  });
  it("C: lower NHL slate volume wins otherwise equal schedules", () => {
    const heavy = Array.from({length:10},()=>game(mon,"BOS","TOR"));
    const i = input({scheduleProvider:schedule([...heavy,game(mon,"CAR","NYR"),game(wed,"VAN","NYR")])});
    expect(targets(i).targets[0].teamAbbrev).toBe("VAN");
    expect(team(i).lowVolumeGames).toBe(1);
  });
  it("D: a usable back-to-back is a modest bonus above timing", () => {
    const i = input({scheduleProvider:schedule([game(mon,"CAR","TOR"),game(wed,"CAR","TOR"),game(sat,"VAN","BOS"),game(sun,"VAN","BOS")])});
    expect(targets(i).targets[0]).toMatchObject({teamAbbrev:"VAN",backToBackCount:1});
  });
  it("E: past games and already started games contribute zero", () => {
    const live = {...game(fri,"VAN","BOS"), startTime:`${fri}T18:00:00Z`};
    const i=input({scheduleProvider:schedule([game(mon,"VAN","BOS"),live,game(sun,"VAN","BOS")])});
    expect(targets(i,fri,"TODAY",`${fri}T19:00:00Z`).targets[0].remainingDates).toEqual([sun]);
    expect(targets(i,"2026-10-12").status).toBe("past");
  });
  it("F: next-day acquisitions cannot help today's game", () => {
    const i=input({scheduleProvider:schedule([game(mon,"VAN","BOS"),game(tue,"VAN","BOS")])});
    expect(targets(i,mon,"NEXT_DAY").targets[0].opportunityDates).toEqual([tue]);
    expect(targets(i,mon,"TODAY").targets[0].opportunityDates).toEqual([mon,tue]);
  });
  it("G: planned adds fill capacity on their effective date", () => {
    const i=input({players:playerMap(player("van","VAN","LW"),player("add","BOS","LW")), scheduleProvider:schedule([game(tue,"VAN","BOS"),game(thu,"VAN","BOS")])});
    expect(team(i).opportunityGames).toBe(2);
    i.plannedTransactions=[tx({type:"ADD",addPlayerId:"add",effectiveDate:wed})];
    expect(team(i).opportunityDates).toEqual([tue]);
  });
  it("H: no skater capacity yields an honest empty state, even with goalie space", () => {
    const i=input({rosterConfiguration:slotsConfig({G:2}),scheduleProvider:schedule([game(mon,"VAN","BOS")])});
    expect(targets(i)).toMatchObject({status:"no-fit",targets:[]});
    expect(targets(input()).status).toBe("no-games");
  });
  it("I: future week includes its full schedule and starts acquisitions on Monday", () => {
    const i=input({scheduleProvider:schedule([game(mon,"VAN","BOS"),game(sun,"VAN","BOS")])});
    expect(targets(i,"2026-09-28","NEXT_DAY")).toMatchObject({effectiveDate:mon,targets:[{remainingGames:2}]});
  });
  it("J: equal inputs and reordered catalogs return deterministic alphabetical ties", () => {
    const i=input({scheduleProvider:schedule([game(mon,"VAN","CAR")])});
    expect(targets(i).targets.map(t=>t.teamAbbrev)).toEqual(["CAR","VAN"]);
    expect(targets({...i,players:Object.fromEntries(Object.entries(i.players).reverse())})).toEqual(targets(i));
  });
  it("full rosters still have streaming value on off nights; no roster-capacity gate", () => {
    const i=input({rosterConfiguration:{...slotsConfig({LW:1}),benchSlots:0},roster:[rostered("own")],players:playerMap(player("own","BOS","LW"),player("van","VAN","LW")),scheduleProvider:schedule([game(mon,"VAN","TOR")])});
    expect(team(i).opportunityGames).toBe(1);
  });
  it("position compatibility excludes a center when only LW is open", () => {
    const i=input({rosterConfiguration:slotsConfig({LW:1}),scheduleProvider:schedule([game(mon,"VAN","CAR")])});
    expect(targets(i).targets.map(t=>t.teamAbbrev)).toEqual(["VAN"]);
  });
  it("reuses maximum matching for flexible starters while respecting manual pins", () => {
    const i=input({roster:[rostered("flex")],players:playerMap(player("flex","BOS","C","LW"),player("car","CAR","C")),scheduleProvider:schedule([game(mon,"BOS","CAR")])});
    expect(team(i,"CAR").opportunityGames).toBe(1);
    i.overrides=[{date:mon,playerId:"flex",targetSlotId:"C1"}];
    expect(targets(i).status).toBe("no-fit");
  });
  it("planned drops open capacity; cancelled moves do not", () => {
    const i=input({rosterConfiguration:slotsConfig({LW:1}),roster:[rostered("own")],players:playerMap(player("own","BOS","LW"),player("van","VAN","LW")),scheduleProvider:schedule([game(mon,"BOS","VAN"),game(tue,"BOS","VAN")])});
    const drop=tx({type:"DROP",dropPlayerId:"own",effectiveDate:tue});
    expect(targets({...i,plannedTransactions:[drop]}).targets[0].opportunityDates).toEqual([tue]);
    expect(targets({...i,plannedTransactions:[{...drop,status:"CANCELLED"}]}).status).toBe("no-fit");
  });
  it("does not inflate nights by combining different single-position candidates", () => {
    const i=input({roster:[rostered("c"),rostered("lw")],players:playerMap(player("c","BOS","C"),player("lw","TOR","LW"),player("v1","VAN","C"),player("v2","VAN","LW")),scheduleProvider:schedule([game(mon,"VAN","BOS"),game(tue,"VAN","TOR")])});
    expect(team(i).opportunityGames).toBe(1);
  });
  it("doesn't suggest own players, planned additions, or goalie-only candidates", () => {
    const i=input({players:playerMap(player("v","VAN","G"),player("c","CAR","C")),plannedTransactions:[tx({type:"ADD",addPlayerId:"c",effectiveDate:sun})],scheduleProvider:schedule([game(mon,"VAN","CAR")])});
    expect(targets(i).targets).toEqual([]);
  });
  it("nearer games break otherwise equal ties", () => {
    const i=input({scheduleProvider:schedule([game(mon,"VAN","BOS"),game(wed,"CAR","BOS")])});
    expect(targets(i).targets[0].teamAbbrev).toBe("VAN");
  });
});

describe("Schedule Targets follow the active team workspace", () => {
  it("switching A → B → A recomputes from each team's own lineup (no carry-over)", () => {
    const games = schedule([game(mon, "VAN", "CAR"), game(tue, "VAN", "NYR")]);
    // Team A has an open C slot (CAR's center fits); team B only has an open LW slot (only VAN's winger fits).
    const teamA = input({ rosterConfiguration: slotsConfig({ C: 1 }), scheduleProvider: games });
    const teamB = input({ rosterConfiguration: slotsConfig({ LW: 1 }), scheduleProvider: games });
    const a1 = targets(teamA).targets.map((t) => t.teamAbbrev);
    const b = targets(teamB).targets.map((t) => t.teamAbbrev);
    const a2 = targets(teamA).targets.map((t) => t.teamAbbrev);
    expect(a1).toEqual(["CAR"]);
    expect(b).toEqual(["VAN"]);
    expect(a2).toEqual(a1);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { game, player, playerMap, rostered, schedule, slotsConfig } from "@/domain/testing/fixtures";
import { generateDailyLineup } from "@/domain/lineup/generateDailyLineup";
import type { PlannedTransaction } from "@/domain/types";
import { StoreProvider } from "@/state/store";
import type { AppStateRepository } from "@/state/repository";
import { DayCard } from "./DayCard";

const DATE = "2026-10-13"; // Tuesday
const players = playerMap(player("mcdavid", "EDM", "C"), player("bench", "BOS", "LW"), player("off", "ANA", "C"));
const noopRepo: AppStateRepository = { load: () => ({ status: "empty", state: null }), save: () => {}, clear: () => {} } as unknown as AppStateRepository;
const config = slotsConfig({ C: 3, LW: 1 });

function render(opts: { date?: string; games?: boolean; isPast?: boolean; moves?: PlannedTransaction[]; problems?: Map<string, string>; nextWeek?: boolean; benchOnly?: boolean } = {}) {
  const date = opts.date ?? DATE;
  const day = generateDailyLineup({
    roster: [rostered("mcdavid"), rostered("bench", "BENCH"), rostered("off")],
    players,
    date,
    scheduleProvider: schedule(opts.games === false ? [] : [game(date, "EDM", "BOS")]),
    rosterConfiguration: opts.benchOnly ? slotsConfig({ C: 1 }) : config,
  });
  return renderToStaticMarkup(
    <StoreProvider repository={noopRepo}>
      <DayCard day={day} isToday={false} isPast={!!opts.isPast} movesToday={opts.moves ?? []} moveProblems={opts.problems} nextWeek={opts.nextWeek} statusRows={opts.moves?.length ?? 0} players={players} onMovePlayer={() => {}} onAddToSlot={() => {}} />
    </StoreProvider>,
  );
}

describe("DayCard", () => {
  it("labels open slots with day, date, position and ordinal", () => {
    const html = render();
    expect(html).toMatch(/aria-label="Open center slot for Tuesday Oct 13, slot 2 of 3\. (Add a player|Start a benched player or add a player)"/);
    expect(html).toMatch(/aria-label="Open center slot for Tuesday Oct 13, slot 3 of 3\. /);
  });

  it("marks the optional next-week day as Next week", () => {
    expect(render()).not.toContain("Next week");
    expect(render({ nextWeek: true })).toContain("Next week");
  });

  it("groups the active lineup with counts from settings", () => {
    const html = render();
    expect(html).toContain("FORWARDS · 4");
  });

  it("makes past-day open slots passive", () => {
    const html = render({ isPast: true });
    expect(html).not.toContain("Add a player for");
    expect(html).toContain("Open slot");
  });

  it("does not offer a bench move on a past day", () => {
    expect(render({ benchOnly: true })).toContain('aria-label="bench has a game but is benched. Move to a lineup spot"');
    expect(render({ benchOnly: true, isPast: true })).not.toContain('aria-label="bench has a game but is benched. Move to a lineup spot"');
  });

  it("makes zero-game days passive: No games, never 15 Add actions", () => {
    const html = render({ games: false });
    expect(html).not.toContain("Add a player for");
    expect(html).toContain("No games");
  });

  it("shows a bench player moved into the lineup only once: the bench row says In lineup today", () => {
    const html = render();
    const bench = html.slice(html.search(/bench<\/span>/));
    expect(bench).toContain("In lineup today");
    expect(html).not.toContain("Starting today");
  });

  it("renders a planned move as a charcoal transaction band, not a position tile", () => {
    const move: PlannedTransaction = { id: "m", type: "ADD_DROP", addPlayerId: "off", dropPlayerId: "bench", effectiveDate: DATE, status: "PLANNED", createdAt: "" };
    const html = render({ moves: [move] });
    const start = html.indexOf("bg-move-soft");
    const band = html.slice(start - 200, html.indexOf("<ul", start));
    expect(band).toContain("Planned move");
    expect(band).not.toMatch(/pos-(c|lw|rw|d|util|g)-/);
    const text = band.replace(/<!-- -->/g, "");
    expect(text).toContain("+ off");
    expect(text).toContain("− bench");
    expect(text).not.toContain("Needs fixing");
  });

  it("flags a broken planned move instead of showing it as fine", () => {
    const move: PlannedTransaction = { id: "m", type: "ADD_DROP", addPlayerId: "off", dropPlayerId: "gone", effectiveDate: DATE, status: "PLANNED", createdAt: "" };
    const html = render({ moves: [move], problems: new Map([["m", "That player isn't on your roster on this date."]]) });
    expect(html).toContain("Needs fixing");
    expect(html).toContain("line-through");
    expect(html).toContain("isn&#x27;t on your roster");
  });
});

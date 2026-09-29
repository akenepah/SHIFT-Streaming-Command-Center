import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Player } from "@/domain/types";
import { SlotTile } from "./SlotTile";

const noop = () => {};
const player: Player = { id: "p", name: "Evgeni Malkin", nhlTeamId: "PIT", eligiblePositions: ["C", "LW"] };

describe("SlotTile: empty active slots are white Open slot buttons", () => {
  it.each(["C", "LW", "RW", "D", "UTIL", "G"] as const)("%s shows a real, untinted button with + icon and Open slot", (slot) => {
    const html = renderToStaticMarkup(
      <SlotTile kind="add" badge={slot} ariaLabel={`Add a player for Tuesday at ${slot}`} onAdd={noop} />,
    );
    expect(html.startsWith("<button")).toBe(true);
    expect(html).toContain('type="button"');
    expect(html).toContain(`aria-label="Add a player for Tuesday at ${slot}"`);
    expect(html).toContain("Open slot");
    const tileClass = html.match(/class="([^"]*)"/)![1];
    expect(tileClass).toContain("bg-surface"); // white by default…
    expect(tileClass).not.toMatch(/(^| )bg-pos-/); // …never tinted until hover/focus
    expect(html).toContain(`hover:bg-pos-${slot.toLowerCase()}-soft`);
    expect(html).toContain("h-14"); // 56px active row
    expect(html).toContain("<svg"); // the plus icon
    expect(html).toContain(`>${slot}</span>`); // position badge
    expect(html).toContain("focus-visible:"); // keyboard focus state
  });
});

describe("SlotTile: BN and IR+ placeholders stay passive", () => {
  it.each(["BN", "IR+"] as const)("%s empty slot is not interactive and never says Add player", (badge) => {
    const html = renderToStaticMarkup(<SlotTile kind="open" badge={badge} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Add player");
    expect(html).toContain("Open slot");
  });
});

describe("SlotTile: occupied tiles are unchanged", () => {
  it("tints occupied active slots by position, with a 36px headshot and Body/Medium name", () => {
    const html = renderToStaticMarkup(<SlotTile kind="player" badge="RW" player={{ ...player, headshot: "https://assets.nhle.com/x.png" }} secondary="vs WPG" />);
    expect(html).toContain("bg-pos-rw-soft");
    expect(html).toContain('width="36"');
    expect(html).toMatch(/font-medium leading-tight text-ink text-body"/);
    expect(html).toContain(">EM<"); // initials placeholder while the headshot loads
  });

  it("renders the player, schedule and override marker, clickable for a one-day move", () => {
    const html = renderToStaticMarkup(
      <SlotTile kind="player" badge="LW" player={player} secondary="vs WPG" overridden onSelect={noop} ariaLabel="Evgeni Malkin, LW, vs WPG. Change lineup spot" />,
    );
    expect(html.startsWith("<button")).toBe(true);
    expect(html).toContain("E. Malkin");
    expect(html).toContain("vs WPG");
    expect(html).toContain("Manual");
    expect(html).not.toContain("Add player");
  });

  it("is a static row when there's nothing to do (e.g. a no-game bench player)", () => {
    const html = renderToStaticMarkup(<SlotTile kind="player" badge="BN" player={player} secondary="No game" />);
    expect(html).not.toContain("<button");
    expect(html).toContain("No game");
  });
});

"use client";

import { Plus } from "lucide-react";
import { Avatar, shortName } from "@/components/player/PlayerBits";
import { POSITION_TONE, PositionBadge, type BadgeKind } from "@/components/ui/Badges";
import type { Player, SlotType } from "@/domain/types";

/** Shared tile height and shape for every planner row, so all states line up. */
const TILE = "flex h-[52px] w-full items-center gap-1.5 rounded-card border px-1.5 text-left 2xl:gap-2 2xl:px-2";

/**
 * One planner row. Three states:
 *  - player: an occupied slot or roster row (optionally clickable for a one-day move)
 *  - add:    an EMPTY ACTIVE slot (C/LW/RW/D/UTIL/G): a real button into Add Player
 *  - open:   an empty BN / IR+ placeholder: passive, never an add target
 */
export type SlotTileProps =
  | {
      kind: "player";
      badge: BadgeKind;
      player: Player;
      secondary: string;
      /** Marks a playable game that isn't being started. */
      benched?: boolean;
      overridden?: boolean;
      onSelect?: (anchor: HTMLElement) => void;
      ariaLabel?: string;
    }
  | { kind: "add"; badge: SlotType; ariaLabel: string; onAdd: () => void }
  | { kind: "open"; badge: BadgeKind; label?: string };

export function SlotTile(props: SlotTileProps) {
  if (props.kind === "add") {
    return (
      <button
        type="button"
        onClick={props.onAdd}
        aria-label={props.ariaLabel}
        className={`${TILE} ${POSITION_TONE[props.badge].tile} group cursor-pointer text-ink-3 transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary focus-visible:border-primary focus-visible:bg-primary-soft focus-visible:text-primary active:bg-primary-line/40`}
      >
        <PositionBadge kind={props.badge} compact />
        <span className="flex min-w-0 items-center gap-0.5 text-caption font-medium 2xl:gap-1 2xl:text-body-sm">
          <Plus aria-hidden className="size-3.5 shrink-0 2xl:size-4" />
          <span className="truncate">Add player</span>
        </span>
      </button>
    );
  }

  if (props.kind === "open") {
    return (
      <div className={`${TILE} ${POSITION_TONE[props.badge].tile} text-ink-3`}>
        <PositionBadge kind={props.badge} compact />
        <span aria-hidden className="size-4 shrink-0 rounded-pill border border-dashed border-line-strong" />
        <span className="truncate text-body-sm">{props.label ?? "Open slot"}</span>
      </div>
    );
  }

  const { player: p, badge, secondary, benched, overridden, onSelect } = props;
  const content = (
    <>
      <PositionBadge kind={badge} compact />
      <span className="contents">
        <Avatar src={p.headshot} name={p.name} size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-medium leading-tight text-ink" title={p.name}>
          {shortName(p.name)}
        </span>
        <span className={`block truncate text-caption leading-tight ${benched ? "font-medium text-warn-strong" : "text-ink-3"}`}>
          {secondary}
          {overridden && <span className="font-semibold text-primary-strong"> · Manual</span>}
        </span>
      </span>
    </>
  );
  const tone = benched ? "border-warn-line bg-warn-soft" : POSITION_TONE[badge].tile;
  if (!onSelect) return <div className={`${TILE} ${tone}`}>{content}</div>;
  return (
    <button
      type="button"
      onClick={(e) => onSelect(e.currentTarget)}
      aria-label={props.ariaLabel}
      className={`${TILE} ${tone} transition-colors hover:border-line-strong`}
    >
      {content}
    </button>
  );
}

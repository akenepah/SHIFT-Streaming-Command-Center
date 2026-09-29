"use client";

import { ArrowLeftRight, Plus } from "lucide-react";
import { Avatar, shortName } from "@/components/player/PlayerBits";
import { POSITION_TONE, PositionBadge, type BadgeKind } from "@/components/ui/Badges";
import type { Player, SlotType } from "@/domain/types";

/** Active lineup rows (56px, 36px headshot) and compact reserve rows (BN / IR+). */
const SHAPE = "flex w-full items-center gap-1.5 rounded-card border px-1.5 text-left 2xl:gap-2 2xl:px-2";
const ACTIVE_ROW = `${SHAPE} h-14`;
const RESERVE_ROW = `${SHAPE} h-11`;
const isReserve = (badge: BadgeKind) => badge === "BN" || badge === "IR+";
/** White/neutral: the "available" surface. Tint is reserved for occupied slots. */
const OPEN_SURFACE = "border-line bg-surface";

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
      /** A bench player who is in today's lineup: shown muted in the bench list. */
      muted?: boolean;
      onSelect?: (anchor: HTMLElement) => void;
      ariaLabel?: string;
    }
  | { kind: "add"; badge: SlotType; ariaLabel: string; onAdd: (anchor: HTMLElement) => void; label?: string }
  | { kind: "open"; badge: BadgeKind; label?: string };

export function SlotTile(props: SlotTileProps) {
  if (props.kind === "add") {
    return (
      <button
        type="button"
        onClick={(e) => props.onAdd(e.currentTarget)}
        aria-label={props.ariaLabel}
        className={`${ACTIVE_ROW} ${OPEN_SURFACE} ${POSITION_TONE[props.badge].accent} group cursor-pointer text-ink-2 transition-colors hover:text-ink focus-visible:text-ink`}
      >
        <PositionBadge kind={props.badge} compact />
        <span className="flex min-w-0 items-center gap-1 text-body-sm font-medium">
          <Plus aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{props.label ?? "Open slot"}</span>
        </span>
      </button>
    );
  }

  if (props.kind === "open") {
    return (
      <div className={`${isReserve(props.badge) ? RESERVE_ROW : ACTIVE_ROW} ${OPEN_SURFACE} text-ink-3`}>
        <PositionBadge kind={props.badge} compact />
        <span aria-hidden className="size-4 shrink-0 rounded-pill border border-dashed border-line-strong" />
        <span className="truncate text-body-sm">{props.label ?? "Open slot"}</span>
      </div>
    );
  }

  const { player: p, badge, secondary, benched, overridden, onSelect } = props;
  const reserve = isReserve(badge);
  const TILE = reserve ? RESERVE_ROW : ACTIVE_ROW;
  const content = (
    <>
      <PositionBadge kind={badge} compact />
      <Avatar src={p.headshot} name={p.name} size={reserve ? 28 : 36} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium leading-tight text-ink ${reserve ? "text-body-sm" : "text-body"}`} title={p.name}>
          {shortName(p.name)}
        </span>
        <span className={`block truncate text-caption leading-tight ${benched ? "font-medium text-warn-strong" : "text-ink-3"}`}>
          {secondary}
          {overridden && <span className="font-semibold text-primary-strong"> · Manual</span>}
        </span>
      </span>
    </>
  );
  const tone = benched ? "border-warn-line bg-warn-soft" : props.muted ? OPEN_SURFACE : POSITION_TONE[badge].tile;
  if (!onSelect) return <div className={`${TILE} ${tone}`}>{content}</div>;
  return (
    <button
      type="button"
      onClick={(e) => onSelect(e.currentTarget)}
      aria-label={props.ariaLabel}
      className={`${TILE} ${tone} group transition-colors hover:border-line-strong`}
    >
      {content}
      {/* Says "this moves" without noise: on hover/focus with a mouse, always on touch screens. */}
      <ArrowLeftRight aria-hidden className="size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100" />
    </button>
  );
}

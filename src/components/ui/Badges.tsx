import { CircleCheck, Pause, ShieldPlus } from "lucide-react";
import type { RosterStatus, SlotType } from "@/domain/types";

export type BadgeKind = SlotType | "BN" | "IR+";

/** Semantic tint per position / roster slot. Tokens only, so retheming is central. */
/**
 * `tile` tints OCCUPIED slots only; open slots stay white. `accent` is the
 * hover/focus hint an open slot picks up (class names spelled out for Tailwind).
 */
export const POSITION_TONE: Record<BadgeKind, { badge: string; tile: string; accent: string }> = {
  C: { badge: "bg-pos-c-soft text-pos-c border-pos-c-line", tile: "bg-pos-c-soft border-pos-c-line", accent: "hover:border-pos-c-line hover:bg-pos-c-soft focus-visible:border-pos-c-line focus-visible:bg-pos-c-soft" },
  LW: { badge: "bg-pos-lw-soft text-pos-lw border-pos-lw-line", tile: "bg-pos-lw-soft border-pos-lw-line", accent: "hover:border-pos-lw-line hover:bg-pos-lw-soft focus-visible:border-pos-lw-line focus-visible:bg-pos-lw-soft" },
  RW: { badge: "bg-pos-rw-soft text-pos-rw border-pos-rw-line", tile: "bg-pos-rw-soft border-pos-rw-line", accent: "hover:border-pos-rw-line hover:bg-pos-rw-soft focus-visible:border-pos-rw-line focus-visible:bg-pos-rw-soft" },
  D: { badge: "bg-pos-d-soft text-pos-d border-pos-d-line", tile: "bg-pos-d-soft border-pos-d-line", accent: "hover:border-pos-d-line hover:bg-pos-d-soft focus-visible:border-pos-d-line focus-visible:bg-pos-d-soft" },
  UTIL: { badge: "bg-pos-util-soft text-pos-util border-pos-util-line", tile: "bg-pos-util-soft border-pos-util-line", accent: "hover:border-pos-util-line hover:bg-pos-util-soft focus-visible:border-pos-util-line focus-visible:bg-pos-util-soft" },
  G: { badge: "bg-pos-g-soft text-pos-g border-pos-g-line", tile: "bg-pos-g-soft border-pos-g-line", accent: "hover:border-pos-g-line hover:bg-pos-g-soft focus-visible:border-pos-g-line focus-visible:bg-pos-g-soft" },
  BN: { badge: "bg-pos-bn-soft text-pos-bn border-pos-bn-line", tile: "bg-surface border-line", accent: "" },
  "IR+": { badge: "bg-pos-ir-soft text-pos-ir border-pos-ir-line", tile: "bg-surface border-line", accent: "" },
};

/** `compact` narrows the badge on laptop widths for dense planner tiles. */
export function PositionBadge({ kind, compact = false, className = "" }: { kind: BadgeKind; compact?: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center justify-center rounded-badge border text-overline leading-none ${
        compact ? "min-w-7 px-1 tracking-normal 2xl:min-w-8 2xl:px-1.5 2xl:tracking-wider" : "min-w-8 px-1.5"
      } ${POSITION_TONE[kind].badge} ${className}`}
    >
      {kind}
    </span>
  );
}

const STATUS: Record<RosterStatus, { label: string; className: string; Icon: typeof CircleCheck }> = {
  ACTIVE: { label: "Active", className: "bg-success-soft text-success border-success-line", Icon: CircleCheck },
  BENCH: { label: "Bench", className: "bg-pos-bn-soft text-pos-bn border-pos-bn-line", Icon: Pause },
  IR_PLUS: { label: "IR+", className: "bg-pos-ir-soft text-pos-ir border-pos-ir-line", Icon: ShieldPlus },
};

/** Roster status as icon + text, never color alone. */
export function StatusBadge({ status }: { status: RosterStatus }) {
  const { label, className, Icon } = STATUS[status];
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-pill border px-2.5 text-caption font-medium ${className}`}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

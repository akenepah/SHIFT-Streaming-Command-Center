/* eslint-disable @next/next/no-img-element -- headshots are arbitrary user URLs */
import { getTeam, type NHLTeamId } from "@/domain/nhl/teams";
import type { PlayerGame, Position, SlotType } from "@/domain/types";

const POS_STYLE: Record<SlotType, string> = {
  C: "bg-pos-c-soft text-pos-c",
  LW: "bg-pos-lw-soft text-pos-lw",
  RW: "bg-pos-rw-soft text-pos-rw",
  D: "bg-pos-d-soft text-pos-d",
  UTIL: "bg-pos-util-soft text-pos-util",
  G: "bg-pos-g-soft text-pos-g",
};

export function SlotBadge({ type, className = "" }: { type: SlotType; className?: string }) {
  return (
    <span
      className={`inline-flex h-5 min-w-8 items-center justify-center rounded px-1 text-[10px] font-bold tracking-wide ${POS_STYLE[type]} ${className}`}
    >
      {type}
    </span>
  );
}

export function PositionList({ positions }: { positions: readonly Position[] }) {
  return <span className="text-ink-2">{positions.join(" / ")}</span>;
}

export function TeamTag({ teamId }: { teamId: NHLTeamId }) {
  const team = getTeam(teamId);
  return (
    <span className="inline-flex items-center gap-1.5 font-medium" title={`${team.city} ${team.name}`}>
      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} />
      {team.id}
    </span>
  );
}

/** "vs STL" at home, "@ STL" away. */
export function matchupText(game: PlayerGame): string {
  return `${game.isHome ? "vs" : "@"} ${game.opponent}`;
}

/** "WSH vs CAR" / "SEA @ CGY", from the player's side. */
export function fullMatchup(teamId: NHLTeamId, game: PlayerGame): string {
  return `${teamId} ${matchupText(game)}`;
}

/** Neutral silhouette used whenever there's no headshot. */
export function Avatar({ src, name, size = 28 }: { src?: string; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-line bg-canvas object-cover"
        style={{ width: size, height: size }}
        title={name}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full border border-line bg-[#e8ebf0]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" className="h-[85%] w-[85%] text-[#aab2bf]" fill="currentColor">
        <circle cx="12" cy="9" r="4.2" />
        <path d="M3.5 24c0-5 3.8-8.2 8.5-8.2s8.5 3.2 8.5 8.2z" />
      </svg>
    </span>
  );
}

/** "Connor McDavid" → "C. McDavid" for tight day columns. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

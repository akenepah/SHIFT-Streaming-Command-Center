/* eslint-disable @next/next/no-img-element -- headshots are arbitrary user URLs */
"use client";

import { useState } from "react";
import { getTeam, type NHLTeamId } from "@/domain/nhl/teams";
import type { PlayerGame, Position } from "@/domain/types";

export function PositionList({ positions }: { positions: readonly Position[] }) {
  return <span className="text-ink-2">{positions.join(", ")}</span>;
}

/** NHL team mark + abbreviation. A small team-color disc stands in for a logo. */
export function TeamTag({ teamId, className = "" }: { teamId: NHLTeamId; className?: string }) {
  const team = getTeam(teamId);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} title={`${team.city} ${team.name}`}>
      <span aria-hidden className="size-3 shrink-0 rounded-pill ring-1 ring-black/10" style={{ backgroundColor: team.color }} />
      <span className="text-data text-ink">{team.id}</span>
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

/** Headshot, or the neutral silhouette. Fixed size, so a missing image never shifts layout. */
export function Avatar({ src, name, size = 28 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-pill border border-line bg-surface-muted object-cover"
        style={box}
        title={name}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-end justify-center overflow-hidden rounded-pill border border-line bg-surface-muted"
      style={box}
    >
      <svg viewBox="0 0 24 24" className="h-[85%] w-[85%] text-line-strong" fill="currentColor">
        <circle cx="12" cy="9" r="4.2" />
        <path d="M3.5 24c0-5 3.8-8.2 8.5-8.2s8.5 3.2 8.5 8.2z" />
      </svg>
    </span>
  );
}

/** Avatar + name (+ optional secondary line). */
export function PlayerIdentity({
  name,
  headshot,
  secondary,
  size = 28,
  short = false,
}: {
  name: string;
  headshot?: string;
  secondary?: string;
  size?: number;
  short?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar src={headshot} name={name} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-body font-medium text-ink">{short ? shortName(name) : name}</span>
        {secondary && <span className="block truncate text-caption text-ink-3">{secondary}</span>}
      </span>
    </span>
  );
}

/** "Connor McDavid" → "C. McDavid" for tight day columns. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words.slice(0, 3).map((w) => w[0]).join("") || "?").toUpperCase();
}

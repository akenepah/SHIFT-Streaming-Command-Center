/* eslint-disable @next/next/no-img-element -- headshots are arbitrary user URLs */
"use client";

import { useState } from "react";
import { getTeam, type NHLTeamId } from "@/domain/nhl/teams";
import type { PlayerGame, Position } from "@/domain/types";

export function PositionList({ positions }: { positions: readonly Position[] }) {
  return <span className="text-ink-2">{positions.join(" · ")}</span>;
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

/**
 * Headshot in a fixed circular frame, so loading or a missing image never
 * shifts layout. Initials show until the image loads, and stay on failure.
 * NHL mugs have generous headroom; a slight zoom anchored near the top fills
 * the circle with head and shoulders.
 */
export function Avatar({ src, name, size = 28 }: { src?: string; name: string; size?: number }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setState("loading");
  }
  const showImage = !!src && state !== "failed";
  return (
    <span
      aria-hidden
      title={name}
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill border border-line bg-surface-muted font-semibold text-ink-3"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.34)) }}
    >
      {state !== "loaded" && <span>{initials(name)}</span>}
      {showImage && (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={`absolute inset-0 h-full w-full origin-[50%_20%] scale-[1.22] object-cover object-top transition-opacity duration-150 ${
            state === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
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

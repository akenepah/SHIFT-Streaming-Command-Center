"use client";

import { AlertTriangle, Search } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { PlayerIdentity, TeamTag } from "@/components/player/PlayerBits";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { CATALOG_ERROR } from "@/domain/players/playerCatalog";
import { searchPlayers } from "@/domain/players/searchPlayers";
import type { Player } from "@/domain/types";

type Mode =
  /** Each row has an action button (Add Player on the Roster / Setup). */
  | { kind: "action"; actionLabel: string; onPick: (p: Player) => void }
  /** Rows are radio options (Plan a Move). */
  | { kind: "select"; name: string; selectedId?: string; onSelect: (p: Player) => void };

/**
 * The one player search used by every "pick a player" flow: the bundled
 * Player Catalog plus the user's saved and manually created players, filtered
 * in memory. Rostered players show as "On roster" and can't be picked again.
 */
export function PlayerSearch({
  inputId,
  query,
  onQueryChange,
  pool,
  isRostered,
  mode,
  onCreateManually,
  idle,
  meta,
  autoFocus = false,
}: {
  inputId: string;
  query: string;
  onQueryChange: (q: string) => void;
  pool: readonly Player[];
  isRostered: (p: Player) => boolean;
  mode: Mode;
  onCreateManually: () => void;
  /** Shown before the user types (e.g. their saved players). */
  idle?: { label: string; players: readonly Player[] };
  /** Extra factual detail per row (e.g. games left this week). */
  meta?: (p: Player) => ReactNode;
  autoFocus?: boolean;
}) {
  const results = useMemo(() => searchPlayers(query, pool), [query, pool]);
  const typed = query.trim().length > 0;
  const rows = typed ? results : (idle?.players ?? []);
  const selectedId = mode.kind === "select" ? mode.selectedId : undefined;

  return (
    <div className="grid gap-3">
      {CATALOG_ERROR && (
        <p role="alert" className="flex items-start gap-2 rounded-control border border-warn-line bg-warn-soft px-3.5 py-2.5 text-body-sm text-warn-strong">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {CATALOG_ERROR} You can still create players manually.
        </p>
      )}
      <div className="relative">
        <label htmlFor={inputId} className="sr-only">
          Search players
        </label>
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          id={inputId}
          type="search"
          className="pl-10"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search players"
          autoComplete="off"
          {...(autoFocus ? { "data-autofocus": true } : {})}
        />
      </div>

      {!typed && idle && idle.players.length > 0 && <p className="text-overline uppercase text-ink-3">{idle.label}</p>}

      {rows.length > 0 && (
        <ul
          aria-label={typed ? "Search results" : idle?.label}
          role={mode.kind === "select" ? "radiogroup" : undefined}
          className="max-h-80 divide-y divide-line overflow-y-auto rounded-card border border-line"
        >
          {rows.map((p) => {
            const rostered = isRostered(p);
            const detail = `${p.nhlTeamId} · ${p.eligiblePositions.join(", ")}${p.source === "CUSTOM" ? " · created by you" : ""}`;
            if (mode.kind === "action") {
              return (
                <li key={p.id} className="flex items-center gap-4 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <PlayerIdentity name={p.name} headshot={p.headshot} secondary={detail} />
                  </span>
                  {meta?.(p)}
                  <TeamTag teamId={p.nhlTeamId} className="hidden sm:inline-flex" />
                  {rostered ? (
                    <span className="inline-flex h-8 items-center rounded-control border border-line bg-surface-muted px-3 text-body-sm font-medium text-ink-2">
                      On roster
                    </span>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => mode.onPick(p)} aria-label={`${mode.actionLabel} ${p.name}`}>
                      {mode.actionLabel}
                    </Button>
                  )}
                </li>
              );
            }
            return (
              <li key={p.id}>
                <label
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    rostered
                      ? "cursor-not-allowed opacity-70"
                      : `cursor-pointer has-[:focus-visible]:bg-primary-soft ${selectedId === p.id ? "bg-primary-soft" : "hover:bg-surface-muted"}`
                  }`}
                >
                  <input
                    type="radio"
                    name={mode.name}
                    className="accent-primary"
                    checked={selectedId === p.id}
                    disabled={rostered}
                    onChange={() => mode.onSelect(p)}
                  />
                  <span className="min-w-0 flex-1">
                    <PlayerIdentity name={p.name} headshot={p.headshot} secondary={detail} />
                  </span>
                  {rostered ? <span className="text-caption font-medium text-ink-2">On roster</span> : meta?.(p)}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {typed && results.length === 0 && (
        <div className="rounded-card border border-dashed border-line-strong px-4 py-3.5">
          <p className="text-body-sm text-ink-2">No matching player in the SHIFT Player Catalog.</p>
          <Button size="sm" className="mt-2.5" onClick={onCreateManually}>
            Create player manually
          </Button>
        </div>
      )}
      {!typed && !(idle && idle.players.length) && (
        <p className="text-body-sm text-ink-3">Type a player&apos;s name, like &ldquo;McDavid&rdquo;.</p>
      )}
      {(typed ? results.length > 0 : true) && (
        <p className="text-body-sm text-ink-2">
          Not in the catalog?{" "}
          <button type="button" className="font-semibold text-primary-strong hover:underline" onClick={onCreateManually}>
            Create player manually
          </button>
        </p>
      )}
    </div>
  );
}

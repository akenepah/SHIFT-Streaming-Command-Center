/**
 * Player Catalog validation. Dependency-free on purpose: the refresh script
 * (scripts/refresh-player-catalog.mjs) imports this file directly with Node,
 * and the test suite runs the same rules against the bundled dataset.
 */

export const CATALOG_POSITIONS = ["C", "LW", "RW", "D", "G"] as const;
export type CatalogPosition = (typeof CATALOG_POSITIONS)[number];

/** NHL primary-position code → SHIFT position. Anything else is rejected. */
const NHL_POSITION_MAP: Readonly<Record<string, CatalogPosition>> = { C: "C", L: "LW", R: "RW", D: "D", G: "G" };

export function normalizeNhlPosition(code: unknown): CatalogPosition | null {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(NHL_POSITION_MAP, code)
    ? NHL_POSITION_MAP[code]
    : null;
}

/** Search/identity comparison form of a name. Never used for display. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’‘`´]/g, "")
    .replace(/[-‐‑–—_/]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type CatalogValidationOptions = {
  /** SHIFT's canonical team codes. */
  teamIds: readonly string[];
  /** Team codes present in the bundled schedule dataset. */
  scheduleTeamIds: readonly string[];
  /** Required entry count for this dataset (250 for 2026-27). */
  expectedCount?: number;
};

const HEADSHOT_HOSTS = new Set(["assets.nhle.com"]);

/** Returns a list of problems; empty means the catalog is valid. */
export function validateCatalog(data: unknown, opts: CatalogValidationOptions): string[] {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) return ["Catalog is not an object"];
  const d = data as Record<string, unknown>;
  const players = d.players;
  if (!Array.isArray(players)) return ["Catalog has no players array"];

  if (d.playerCount !== players.length) errors.push(`playerCount ${String(d.playerCount)} ≠ ${players.length} entries`);
  if (opts.expectedCount !== undefined && players.length !== opts.expectedCount)
    errors.push(`Expected exactly ${opts.expectedCount} players, found ${players.length}`);

  const teams = new Set(opts.teamIds);
  const scheduleTeams = new Set(opts.scheduleTeamIds);
  const ids = new Map<number, string>();
  const identities = new Map<string, string>();

  players.forEach((raw, i) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const label = `players[${i}] ${typeof p.fullName === "string" ? p.fullName : "?"}`;
    if (!Number.isInteger(p.nhlPlayerId) || (p.nhlPlayerId as number) <= 0) errors.push(`${label}: invalid nhlPlayerId`);
    else if (ids.has(p.nhlPlayerId as number)) errors.push(`${label}: duplicate nhlPlayerId ${p.nhlPlayerId} (also ${ids.get(p.nhlPlayerId as number)})`);
    else ids.set(p.nhlPlayerId as number, label);

    for (const field of ["firstName", "lastName", "fullName"] as const) {
      if (typeof p[field] !== "string" || !(p[field] as string).trim()) errors.push(`${label}: missing ${field}`);
    }
    if (typeof p.fullName === "string" && typeof p.teamAbbrev === "string") {
      const key = `${normalizeSearchText(p.fullName)}|${p.teamAbbrev}|${p.primaryPosition}`;
      if (identities.has(key)) errors.push(`${label}: duplicate identity (same name and team as ${identities.get(key)})`);
      else identities.set(key, label);
    }

    if (!CATALOG_POSITIONS.includes(p.primaryPosition as CatalogPosition))
      errors.push(`${label}: unsupported position ${String(p.primaryPosition)}`);

    if (p.teamAbbrev !== null) {
      if (typeof p.teamAbbrev !== "string" || !teams.has(p.teamAbbrev)) errors.push(`${label}: unknown team ${String(p.teamAbbrev)}`);
      else if (p.active === true && !scheduleTeams.has(p.teamAbbrev)) errors.push(`${label}: team ${p.teamAbbrev} missing from schedule`);
    }

    if (p.headshotUrl !== null) {
      let ok = false;
      try {
        const url = new URL(String(p.headshotUrl));
        ok = url.protocol === "https:" && HEADSHOT_HOSTS.has(url.hostname);
      } catch {
        ok = false;
      }
      if (!ok) errors.push(`${label}: headshotUrl must be an https NHL asset URL or null`);
    }
    if (typeof p.active !== "boolean") errors.push(`${label}: active must be boolean`);
  });
  return errors;
}

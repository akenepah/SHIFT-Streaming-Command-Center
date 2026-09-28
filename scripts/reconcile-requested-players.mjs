/**
 * Reconcile the user-supplied requested player list (the catalog FLOOR) against
 * the bundled NHL catalog. Every requested name is resolved to a durable NHL ID
 * or reported as unresolved; nothing is guessed.
 *
 *   node --no-warnings scripts/reconcile-requested-players.mjs [docs/player-catalog/requested-2026-27.csv]
 *
 * - Identity: NHL player ID. Name matches must also agree on position group
 *   (F / D / G); "(D)" / "(G)" disambiguators in the list are honored.
 * - Players missing from the roster-based catalog are resolved through the NHL
 *   player search + landing endpoints and ADDED to the catalog.
 * - Fantasy eligibility comes from the list's POS column (source MANUAL:
 *   curated list, not a live Yahoo pull). Yahoo IDs stay null until a verified
 *   Yahoo export is imported (scripts/import-yahoo-eligibility.mjs).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeNhlPosition, normalizeSearchText } from "../src/domain/players/validation.ts";

const listPath = process.argv[2] ?? "docs/player-catalog/requested-2026-27.csv";
const CATALOG = "src/data/players/2026-27.json";
const ELIGIBILITY = "src/data/players/eligibility-2026-27.json";
const ORDER = ["C", "LW", "RW", "D", "G"];
const cache = "/tmp/shift-nhl-identity-cache";
mkdirSync(cache, { recursive: true });

async function get(url) {
  const path = `${cache}/${encodeURIComponent(url)}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 250));
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const data = await res.json();
      writeFileSync(path, JSON.stringify(data));
      return data;
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, Math.min(30000, 2000 * 2 ** attempt)));
  }
  throw new Error(`Rate limit or server failure: ${url}`);
}

// First-name variants the list uses vs NHL records (never used without a last-name + position match).
const ALIASES = {
  alex: ["alexander", "aleksander", "alexandre", "alexei", "aleksei", "alexey", "alexis"],
  max: ["maxim", "maksim", "maxime", "maximilian"],
  mathew: ["matthew"],
  matt: ["matthew"],
  nick: ["nicholas", "nicolas"],
  nicholas: ["nick"],
  josh: ["joshua"],
  joe: ["joseph"],
  ozzy: ["oskar", "oscar"],
  will: ["william"],
  zach: ["zachary"],
  mitch: ["mitchell"],
  jake: ["jacob"],
  tom: ["thomas"],
  thomas: ["tomas"],
  yegor: ["egor"],
  alexei: ["alexey", "aleksei"],
};
// Hand-verified identities (NHL search, Sep 28 2026) for names the list spells
// differently from NHL records, or players the active search omits.
const MANUAL_IDS = {
  "Janis Moser": 8482655, // NHL: J.J. Moser (TBL)
  "Thomas Novak": 8478438, // NHL: Tommy Novak (PIT)
  "Emil Martinsen Lilleberg": 8482929, // NHL: Emil Lilleberg (TBL)
  "Ryan Graves": 8477435, // NHL search: inactive
  "Adam Boqvist": 8480871, // NHL search: inactive, no current team
  "Jonathan Drouin": 8477494, // NHL search: inactive, no current team
  "Otto Stenberg": 8484230, // NHL search: inactive
};
const group = (pos) => (pos === "G" ? "G" : pos === "D" ? "D" : "F");
const firstNameOk = (want, got) => {
  if (want === got) return true;
  if ((ALIASES[want] ?? []).includes(got) || (ALIASES[got] ?? []).includes(want)) return true;
  return want.length >= 3 && got.length >= 3 && (got.startsWith(want) || want.startsWith(got));
};

function parseCsv(text) {
  const [header, ...lines] = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const cols = header.split(",");
  const nameIdx = cols.indexOf("Name");
  const posIdx = cols.indexOf("POS");
  if (nameIdx < 0 || posIdx < 0) throw new Error("CSV needs Name and POS columns");
  return lines.map((line) => {
    // POS may be quoted ("LW,RW"); Name never contains commas.
    const m = line.match(/^([^,]*),(?:"([^"]*)"|([^,]*))/);
    if (nameIdx !== 0 || posIdx !== 1 || !m) {
      const cells = line.match(/("([^"]*)"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
      return { raw: cells[nameIdx], pos: cells[posIdx] };
    }
    return { raw: m[1], pos: m[2] ?? m[3] };
  });
}

const requested = parseCsv(readFileSync(listPath, "utf8")).map((r) => {
  const hint = r.raw.match(/\((C|LW|RW|D|G)\)\s*$/)?.[1] ?? null;
  const name = r.raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const eligible = ORDER.filter((p) => r.pos.split(/[,/ ]+/).includes(p));
  return { requestedName: r.raw, name, hint, eligible };
});

const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const byName = new Map();
for (const p of catalog.players) {
  const key = normalizeSearchText(p.fullName);
  byName.set(key, [...(byName.get(key) ?? []), p]);
}

const results = [];
const added = [];
for (const r of requested) {
  const wantGroup = group(r.hint ?? r.eligible.find((p) => p === "G" || p === "D") ?? "C");
  const problems = [];
  if (!r.eligible.length) problems.push("no valid POS in list");
  let entry = null;
  let method = null;

  const manualId = MANUAL_IDS[r.requestedName];
  const local = manualId ? [] : (byName.get(normalizeSearchText(r.name)) ?? []).filter((p) => group(p.primaryPosition) === wantGroup);
  if (local.length === 1) {
    entry = local[0];
    method = "catalog";
  } else if (local.length > 1) {
    problems.push(`ambiguous in catalog: ${local.map((p) => p.nhlPlayerId).join(", ")}`);
  } else if (manualId) {
    const land = await get(`https://api-web.nhle.com/v1/player/${manualId}/landing`);
    const existing = catalog.players.find((p) => p.nhlPlayerId === manualId);
    entry = existing ?? {
      nhlPlayerId: land.playerId,
      firstName: land.firstName.default,
      lastName: land.lastName.default,
      fullName: `${land.firstName.default} ${land.lastName.default}`,
      teamAbbrev: land.currentTeamAbbrev ?? null,
      primaryPosition: normalizeNhlPosition(land.position),
      headshotUrl: land.headshot ?? null,
      active: land.isActive === true,
    };
    if (!existing) added.push(entry);
    method = "manual";
  } else {
    const parts = normalizeSearchText(r.name).split(" ");
    const [first, ...rest] = parts;
    const last = rest.join(" ");
    const hits = await get(`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=40&active=true&q=${encodeURIComponent(rest.join(" "))}`);
    const candidates = hits.filter((h) => {
      const [hf, ...hl] = normalizeSearchText(h.name).split(" ");
      const pos = normalizeNhlPosition(h.positionCode);
      return h.active && hl.join(" ") === last && firstNameOk(first, hf) && pos && group(pos) === wantGroup;
    });
    if (candidates.length === 1) {
      const land = await get(`https://api-web.nhle.com/v1/player/${candidates[0].playerId}/landing`);
      const existing = catalog.players.find((p) => p.nhlPlayerId === land.playerId);
      entry = existing ?? {
        nhlPlayerId: land.playerId,
        firstName: land.firstName.default,
        lastName: land.lastName.default,
        fullName: `${land.firstName.default} ${land.lastName.default}`,
        teamAbbrev: land.currentTeamAbbrev ?? null,
        primaryPosition: normalizeNhlPosition(land.position),
        headshotUrl: land.headshot ?? null,
        active: land.isActive === true,
      };
      if (!existing) added.push(entry);
      method = existing ? "catalog (alias)" : "nhl search";
    } else {
      problems.push(candidates.length ? `ambiguous search: ${candidates.map((c) => c.playerId).join(", ")}` : "no active NHL match");
    }
  }
  results.push({
    requestedName: r.requestedName,
    requestedEligibility: r.eligible,
    nhlPlayerId: entry?.nhlPlayerId ?? null,
    resolvedName: entry?.fullName ?? null,
    teamAbbrev: entry?.teamAbbrev ?? null,
    primaryPosition: entry?.primaryPosition ?? null,
    headshot: !!entry?.headshotUrl,
    active: entry?.active ?? null,
    method,
    problems,
  });
}

// Merge additions into the catalog (sorted like the refresh script).
const players = [...catalog.players, ...added].sort(
  (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.nhlPlayerId - b.nhlPlayerId,
);
writeFileSync(
  CATALOG,
  JSON.stringify({ ...catalog, playerCount: players.length, membershipSource: `${catalog.membershipSource.split(" + ")[0]} + requested player list`, generatedAt: new Date().toISOString(), players }, null, 2) + "\n",
);

const resolved = results.filter((r) => r.nhlPlayerId);
const idCounts = new Map();
for (const r of resolved) idCounts.set(r.nhlPlayerId, (idCounts.get(r.nhlPlayerId) ?? 0) + 1);
const duplicateIds = [...idCounts].filter(([, n]) => n > 1).map(([id]) => id);

const eligibility = resolved
  .filter((r) => r.requestedEligibility.length && !duplicateIds.includes(r.nhlPlayerId))
  .map((r) => ({ nhlPlayerId: r.nhlPlayerId, eligiblePositions: r.requestedEligibility, eligibilitySource: "MANUAL", eligibilitySeason: "2026-27", yahooPlayerId: null }))
  .sort((a, b) => a.nhlPlayerId - b.nhlPlayerId);
writeFileSync(ELIGIBILITY, JSON.stringify({ season: "2026-27", source: "Requested player list (curated 2026-27 fantasy eligibility)", players: eligibility }, null, 2) + "\n");

const summary = {
  requested: requested.length,
  resolved: resolved.length,
  resolvedFromCatalog: resolved.filter((r) => r.method?.startsWith("catalog")).length,
  resolvedManually: resolved.filter((r) => r.method === "manual").length,
  resolvedViaNhlSearch: resolved.filter((r) => r.method === "nhl search").length,
  addedToCatalog: added.length,
  unresolved: results.length - resolved.length,
  unresolvedNames: results.filter((r) => !r.nhlPlayerId).map((r) => `${r.requestedName} (${r.problems.join("; ")})`),
  duplicateNhlIds: duplicateIds,
  missingHeadshot: resolved.filter((r) => !r.headshot).map((r) => r.requestedName),
  missingTeam: resolved.filter((r) => !r.teamAbbrev).map((r) => r.requestedName),
  inactive: resolved.filter((r) => r.active === false).map((r) => r.requestedName),
  eligibilityFromList: eligibility.length,
  multiPosition: eligibility.filter((e) => e.eligiblePositions.length > 1).length,
  yahooIdsResolved: 0,
  catalogTotal: players.length,
};
writeFileSync("docs/player-catalog/requested-reconciliation.json", JSON.stringify({ summary, results }, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));

#!/usr/bin/env node
/**
 * Development-time Player Catalog refresh. The app never calls NHL at runtime.
 *
 *   npm run catalog:refresh
 *
 * 1. Fetch NHL.com's "Fantasy hockey top 250 player rankings for 2026-27" and
 *    parse exactly 250 listed players (name, listed team, F/D/G). Membership
 *    only: rank order is kept in the dev snapshot, never in the app catalog.
 * 2. Build an identity index from every 2026-27 NHL roster
 *    (api-web.nhle.com/v1/roster/{TEAM}/20262027) for SHIFT's canonical teams.
 * 3. Resolve each name by exact normalized full name. Several matches →
 *    listed team, then position group. Not on a roster → NHL player search,
 *    same exact-name rule. Nothing is guessed; unresolved names are reported.
 * 4. Fetch /v1/player/{id}/landing: verify the name, normalize the position
 *    (C, L→LW, R→RW, D, G), and take current team, headshot and active status.
 * 5. Validate with the same rules the tests use (src/domain/players/validation.ts).
 *    Any unresolved player or validation error → nothing is written, exit 1.
 * 6. Write the catalog (sorted by last name, deterministic) plus dev-only
 *    provenance and audit files in docs/player-catalog/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeNhlPosition, normalizeSearchText as normalize, validateCatalog } from "../src/domain/players/validation.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEASON = "2026-27";
const SEASON_ID = "20262027";
const EXPECTED = 250;
const MEMBERSHIP_SOURCE = "NHL.com Fantasy Top 250";
const MEMBERSHIP_SOURCE_URL =
  "https://www.nhl.com/news/topic/fantasy/nhl-fantasy-hockey-top-250-200-rankings-drafts-players-big-board-281505474";
const CATALOG = resolve(ROOT, "src/data/players/2026-27.json");
const DOCS = resolve(ROOT, "docs/player-catalog");
const CONCURRENCY = 4;
const TIMEOUT_MS = 15_000;

// SHIFT's canonical team registry and the bundled schedule, read from their sources of truth.
const TEAM_IDS = [...readFileSync(resolve(ROOT, "src/domain/nhl/teamIds.ts"), "utf8").matchAll(/"([A-Z]{3})"/g)].map((m) => m[1]);
if (TEAM_IDS.length !== 32) throw new Error(`Expected 32 canonical teams, found ${TEAM_IDS.length}`);
const schedule = JSON.parse(readFileSync(resolve(ROOT, "src/data/nhl/2026-27.json"), "utf8"));
const SCHEDULE_TEAMS = [...new Set(schedule.games.flatMap((g) => [g.homeTeam, g.awayTeam]))];
const GROUP = { C: "F", L: "F", R: "F", D: "D", G: "G" };

// ── HTTP: timeout, retry with backoff, modest concurrency ─────────────────
async function get(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "SHIFT Player Catalog refresh (development tool)" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return res;
      last = new Error(`${res.status} ${url}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** i));
  }
  throw new Error(`Request failed after retries: ${url} (${last?.message ?? last})`);
}
const getJson = async (url) => (await get(url)).json();

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ── 1. Source membership ──────────────────────────────────────────────────
function parseSource(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
  const rows = new Map();
  for (const line of text.split("\n")) {
    const m = /^\s*(\d{1,3})\.\s+(.+?),\s*(F|D|G),\s*([A-Z]{2,3})\b/.exec(line);
    if (m && !rows.has(+m[1])) rows.set(+m[1], { rank: +m[1], name: m[2].trim(), group: m[3], team: m[4] });
  }
  const list = [...rows.values()].sort((a, b) => a.rank - b.rank);
  const problems = [];
  if (list.length !== EXPECTED) problems.push(`parsed ${list.length} listed players, expected ${EXPECTED}`);
  list.forEach((r, i) => {
    if (r.rank !== i + 1) problems.push(`rank sequence broken at ${i + 1}`);
    if (!r.name) problems.push(`empty name at ${r.rank}`);
  });
  const seen = new Map();
  for (const r of list) {
    const key = normalize(r.name);
    if (seen.has(key)) problems.push(`duplicate source name "${r.name}" (#${seen.get(key)} and #${r.rank})`);
    seen.set(key, r.rank);
  }
  if (problems.length) throw new Error(`Source page no longer parses into a trustworthy list:\n  ${problems.join("\n  ")}`);
  return {
    players: list,
    publishedAt: /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null,
    modifiedAt: /"dateModified"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null,
  };
}

// ── 2. Identity index ─────────────────────────────────────────────────────
async function buildRosterIndex() {
  const index = new Map();
  await mapLimit(TEAM_IDS, CONCURRENCY, async (team) => {
    const roster = await getJson(`https://api-web.nhle.com/v1/roster/${team}/${SEASON_ID}`);
    for (const p of [...(roster.forwards ?? []), ...(roster.defensemen ?? []), ...(roster.goalies ?? [])]) {
      const key = normalize(`${p.firstName.default} ${p.lastName.default}`);
      index.set(key, [...(index.get(key) ?? []), { id: p.id, team, positionCode: p.positionCode }]);
    }
  });
  return index;
}

async function searchCandidates(name) {
  const search = (q) =>
    getJson(`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=40&q=${encodeURIComponent(q)}`);
  const exact = (rows) =>
    rows
      .filter((r) => normalize(r.name) === normalize(name))
      .map((r) => ({ id: Number(r.playerId), team: r.teamAbbrev, positionCode: r.positionCode }));
  let found = exact(await search(name));
  // Hyphenated names sometimes only match on the last name; still exact full-name only.
  if (!found.length) found = exact(await search(name.split(" ").slice(1).join(" ")));
  return found;
}

function pickUnique(candidates, src) {
  if (candidates.length === 1) return { match: candidates[0], tiebreak: null };
  const byTeam = candidates.filter((c) => c.team === src.team);
  if (byTeam.length === 1) return { match: byTeam[0], tiebreak: "listed team" };
  const pool = byTeam.length ? byTeam : candidates;
  const byGroup = pool.filter((c) => GROUP[c.positionCode] === src.group);
  if (byGroup.length === 1) return { match: byGroup[0], tiebreak: byTeam.length ? "listed team + position" : "position" };
  return { match: null, ambiguous: pool };
}

// ── 3–4. Resolve + landing ────────────────────────────────────────────────
async function resolvePlayer(src, index) {
  const row = { sourceName: src.name, sourceTeam: src.team, sourcePositionGroup: src.group };
  let method = "roster index";
  let candidates = index.get(normalize(src.name)) ?? [];
  if (!candidates.length) {
    method = "player search";
    candidates = await searchCandidates(src.name);
  }
  if (!candidates.length) return { audit: { ...row, status: "unresolved", reason: "No NHL player with this exact name" } };
  const { match, tiebreak, ambiguous } = pickUnique(candidates, src);
  if (!match)
    return {
      audit: {
        ...row,
        status: "unresolved",
        reason: `${ambiguous.length} NHL players share this name; listed team and position don't separate them`,
        candidates: ambiguous,
      },
    };

  const landing = await getJson(`https://api-web.nhle.com/v1/player/${match.id}/landing`);
  const firstName = landing.firstName?.default?.trim() ?? "";
  const lastName = landing.lastName?.default?.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  const base = { ...row, nhlPlayerId: match.id, method, tiebreak };
  if (normalize(fullName) !== normalize(src.name))
    return { audit: { ...base, status: "unresolved", reason: `Landing name "${fullName}" doesn't match` } };
  const primaryPosition = normalizeNhlPosition(landing.position);
  if (!primaryPosition)
    return { audit: { ...base, status: "unresolved", reason: `Unsupported NHL position code "${landing.position}"`, positionFailure: true } };
  const teamAbbrev = landing.currentTeamAbbrev && TEAM_IDS.includes(landing.currentTeamAbbrev) ? landing.currentTeamAbbrev : null;
  if (landing.currentTeamAbbrev && !teamAbbrev)
    return { audit: { ...base, status: "unresolved", reason: `Team "${landing.currentTeamAbbrev}" isn't in SHIFT's registry` } };

  const entry = {
    nhlPlayerId: match.id,
    firstName,
    lastName,
    fullName,
    teamAbbrev,
    primaryPosition,
    headshotUrl: typeof landing.headshot === "string" && landing.headshot ? landing.headshot : null,
    active: landing.isActive === true,
  };
  return {
    entry,
    audit: {
      ...base,
      status: "resolved",
      currentTeam: teamAbbrev,
      primaryPosition,
      hasHeadshot: entry.headshotUrl !== null,
      active: entry.active,
      teamMismatch: teamAbbrev !== src.team,
    },
  };
}

// ── Run ───────────────────────────────────────────────────────────────────
console.log("Fetching membership source…");
const source = parseSource(await (await get(MEMBERSHIP_SOURCE_URL)).text());
console.log(`Source: ${source.players.length} players (published ${source.publishedAt}, modified ${source.modifiedAt})`);
console.log("Building roster index…");
const index = await buildRosterIndex();
console.log(`Resolving ${source.players.length} players…`);
const results = await mapLimit(source.players, CONCURRENCY, (p) => resolvePlayer(p, index));

const entries = results
  .filter((r) => r.entry)
  .map((r) => r.entry)
  .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.nhlPlayerId - b.nhlPlayerId);
const audit = results.map((r) => r.audit);
const unresolved = audit.filter((a) => a.status !== "resolved");
const idCounts = entries.reduce((m, e) => m.set(e.nhlPlayerId, (m.get(e.nhlPlayerId) ?? 0) + 1), new Map());
const duplicateIds = entries.filter((e) => idCounts.get(e.nhlPlayerId) > 1);

const catalog = {
  season: SEASON,
  playerCount: entries.length,
  membershipSource: MEMBERSHIP_SOURCE,
  membershipSourceUrl: MEMBERSHIP_SOURCE_URL,
  membershipSourcePublishedAt: source.publishedAt,
  membershipSourceModifiedAt: source.modifiedAt,
  generatedAt: new Date().toISOString(),
  players: entries,
};
const validation = validateCatalog(catalog, { teamIds: TEAM_IDS, scheduleTeamIds: SCHEDULE_TEAMS, expectedCount: EXPECTED });

// Membership change against the catalog being replaced (by NHL id).
const previous = existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, "utf8")) : null;
const prevPlayers = previous?.players ?? [];
const prevIds = new Map(prevPlayers.map((p) => [p.nhlPlayerId ?? p.nhlId, p.fullName ?? p.name]));
const nextIds = new Set(entries.map((e) => e.nhlPlayerId));
const membershipChange = {
  added: entries.filter((e) => !prevIds.has(e.nhlPlayerId)).map((e) => e.fullName),
  removed: [...prevIds].filter(([id]) => !nextIds.has(id)).map(([, name]) => name),
};

const names = (xs) => xs.map((x) => x.sourceName ?? x.fullName);
const summary = {
  "Source entries": source.players.length,
  Resolved: `${entries.length} / ${source.players.length}`,
  "Unique NHL IDs": new Set(entries.map((e) => e.nhlPlayerId)).size,
  Active: entries.filter((e) => e.active).length,
  Inactive: entries.filter((e) => !e.active).length,
  "Missing current team": entries.filter((e) => e.teamAbbrev === null).length,
  "Missing headshot": entries.filter((e) => e.headshotUrl === null).length,
  "Source/current team mismatches": audit.filter((a) => a.teamMismatch).length,
  "Position normalization failures": audit.filter((a) => a.positionFailure).length,
  "Duplicate NHL IDs": duplicateIds.length,
  "Unresolved identities": unresolved.length,
};
const problemLists = {
  Inactive: entries.filter((e) => !e.active).map((e) => e.fullName),
  "Missing current team": entries.filter((e) => e.teamAbbrev === null).map((e) => e.fullName),
  "Missing headshot": entries.filter((e) => e.headshotUrl === null).map((e) => e.fullName),
  "Source/current team mismatches": audit.filter((a) => a.teamMismatch).map((a) => `${a.sourceName} (${a.sourceTeam} → ${a.currentTeam ?? "none"})`),
  "Position normalization failures": names(audit.filter((a) => a.positionFailure)),
  "Duplicate NHL IDs": duplicateIds.map((e) => `${e.fullName} (${e.nhlPlayerId})`),
  "Unresolved identities": unresolved.map((a) => `${a.sourceName}: ${a.reason}`),
};

const lines = [
  `# Player Catalog audit: ${SEASON}`,
  "",
  "Development artifact, not shown in the product. Generated by `scripts/refresh-player-catalog.mjs`.",
  "",
  `- Membership source: [${MEMBERSHIP_SOURCE}](${MEMBERSHIP_SOURCE_URL})`,
  `- Source published: ${source.publishedAt}; last modified: ${source.modifiedAt}`,
  `- Generated: ${catalog.generatedAt}`,
  `- Roster index: ${index.size} names across ${TEAM_IDS.length} teams`,
  "",
  "```",
  ...Object.entries(summary).map(([k, v]) => `${k}: ${v}`),
  "```",
  "",
  ...Object.entries(problemLists)
    .filter(([, list]) => list.length)
    .flatMap(([k, list]) => [`## ${k}`, "", ...list.map((x) => `- ${x}`), ""]),
  "## Membership change vs previous catalog",
  "",
  `- Added: ${membershipChange.added.length ? membershipChange.added.join(", ") : "none"}`,
  `- Removed: ${membershipChange.removed.length ? membershipChange.removed.join(", ") : "none"}`,
  "",
  "## Resolutions that needed a tie-break",
  "",
  ...(audit.filter((a) => a.tiebreak).map((a) => `- ${a.sourceName} → ${a.nhlPlayerId} (${a.currentTeam}), by ${a.tiebreak}`) || []),
  "",
  "## Resolution method",
  "",
  ...Object.entries(audit.reduce((m, a) => (a.method ? { ...m, [a.method]: (m[a.method] ?? 0) + 1 } : m), {})).map(
    ([k, v]) => `- ${k}: ${v}`,
  ),
  "",
];

mkdirSync(DOCS, { recursive: true });
writeFileSync(
  resolve(DOCS, `${SEASON}-source.json`),
  JSON.stringify(
    {
      note: "Membership snapshot only (listed order, name, listed team, F/D/G). No article prose. Dev reference; the app never reads this file.",
      membershipSourceUrl: MEMBERSHIP_SOURCE_URL,
      publishedAt: source.publishedAt,
      modifiedAt: source.modifiedAt,
      players: source.players,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  resolve(DOCS, `${SEASON}-audit.json`),
  JSON.stringify({ summary, problemLists, membershipChange, validation, entries: audit }, null, 2) + "\n",
);
writeFileSync(resolve(DOCS, `${SEASON}-audit.md`), lines.join("\n"));

console.log("\n" + Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join("\n"));
for (const [k, list] of Object.entries(problemLists)) if (list.length) console.log(`\n${k}:\n  ${list.join("\n  ")}`);
console.log(`\nMembership change: +${membershipChange.added.length} / -${membershipChange.removed.length}`);
if (membershipChange.added.length || membershipChange.removed.length) console.log(JSON.stringify(membershipChange));

if (unresolved.length || duplicateIds.length || validation.length) {
  if (validation.length) console.error(`\nValidation failed:\n  ${validation.join("\n  ")}`);
  console.error(`\nCatalog NOT written. See docs/player-catalog/${SEASON}-audit.md`);
  process.exit(1);
}
writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + "\n");
console.log(`\nWrote ${CATALOG}`);

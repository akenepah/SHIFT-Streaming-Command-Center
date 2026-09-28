#!/usr/bin/env node
/**
 * Development-time script: build the bundled player catalog. The app never
 * calls NHL APIs at runtime.
 *
 *   node scripts/fetch-player-catalog.mjs
 *
 * Membership: the 250 players in NHL.com's 2026-27 fantasy Top 250 (used only
 * to decide who's included; rank, analysis and projections are not stored).
 *
 * Resolution, per player:
 *   1. NHL player search (search.d3.nhle.com) by full name, falling back to
 *      the last name → exact normalized full-name matches only.
 *   2. More than one match → narrow by the team NHL.com listed, then by
 *      position group (F/D/G). Still ambiguous → reported, not guessed.
 *   3. Fetch api-web.nhle.com/v1/player/{id}/landing and verify the name.
 *   4. Store the landing's current team, position and NHL headshot URL.
 * Every outcome is written to the audit file next to the catalog.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEASON = "2026-27";
const SOURCE = "NHL.com Fantasy Top 250";
const SOURCE_URL =
  "https://www.nhl.com/news/topic/fantasy/nhl-fantasy-hockey-top-250-200-rankings-drafts-players-big-board-281505474";
const SOURCE_UPDATED = "2026-09-27";
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/players");
const TEAMS = new Set(
  "ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH".split(
    " ",
  ),
);
const POSITION = { C: "C", L: "LW", R: "RW", D: "D", G: "G" };
const GROUP = { C: "F", L: "F", R: "F", D: "D", G: "G" };

const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (SHIFT catalog refresh)" } });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error(`Failed: ${url}`);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** "12. Quinn Hughes, D, MIN (INJ.)" → { name, group, team }. Rank numbers are only used to check completeness. */
function parseSource(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ");
  const rows = new Map();
  for (const line of text.split("\n")) {
    const m = /^\s*(\d{1,3})\.\s+(.+?),\s*(F|D|G),\s*([A-Z]{2,3})\b/.exec(line);
    if (m && !rows.has(+m[1])) rows.set(+m[1], { name: m[2].trim(), group: m[3], team: m[4] });
  }
  const numbers = [...rows.keys()];
  const complete = rows.size === 250 && numbers.every((n) => n >= 1 && n <= 250);
  if (!complete) throw new Error(`Expected 250 ranked players, parsed ${rows.size}`);
  return [...rows.values()];
}

async function resolvePlayer(src) {
  // Full name first; some names (e.g. hyphenated) only match on the last name.
  // Either way, only exact full-name matches are accepted.
  const search = async (q) =>
    getJson(`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=40&q=${encodeURIComponent(q)}`);
  let matches = (await search(src.name)).filter((r) => normalize(r.name) === normalize(src.name));
  if (matches.length === 0) {
    const last = src.name.split(" ").slice(1).join(" ");
    matches = (await search(last)).filter((r) => normalize(r.name) === normalize(src.name));
  }
  const audit = { sourceName: src.name, sourceTeam: src.team, sourcePosition: src.group };
  if (matches.length === 0) return { audit: { ...audit, status: "not_found", candidates: 0 } };

  let method = "exact-name";
  if (matches.length > 1) {
    const byTeam = matches.filter((r) => r.teamAbbrev === src.team || r.lastTeamAbbrev === src.team);
    if (byTeam.length >= 1) {
      matches = byTeam;
      method = "exact-name+team";
    }
  }
  if (matches.length > 1) {
    const byGroup = matches.filter((r) => GROUP[r.positionCode] === src.group);
    if (byGroup.length >= 1) {
      matches = byGroup;
      method += "+position";
    }
  }
  if (matches.length > 1) {
    return {
      audit: {
        ...audit,
        status: "ambiguous",
        candidates: matches.map((m) => ({ playerId: m.playerId, team: m.teamAbbrev, position: m.positionCode })),
      },
    };
  }

  const id = Number(matches[0].playerId);
  const landing = await getJson(`https://api-web.nhle.com/v1/player/${id}/landing`);
  const name = `${landing.firstName?.default ?? ""} ${landing.lastName?.default ?? ""}`.trim();
  const base = { ...audit, nhlId: id, method, landingName: name };
  if (normalize(name) !== normalize(src.name)) return { audit: { ...base, status: "name_mismatch" } };
  const team = landing.currentTeamAbbrev;
  const position = POSITION[landing.position];
  if (!team || !TEAMS.has(team)) return { audit: { ...base, status: "no_current_team", currentTeam: team ?? null } };
  if (!position) return { audit: { ...base, status: "unknown_position", position: landing.position } };
  if (!landing.headshot) return { audit: { ...base, status: "no_headshot" } };

  return {
    player: {
      nhlId: id,
      name,
      firstName: landing.firstName.default,
      lastName: landing.lastName.default,
      nhlTeamId: team,
      position,
      headshot: landing.headshot,
      isActive: landing.isActive === true,
    },
    audit: {
      ...base,
      status: "resolved",
      currentTeam: team,
      teamDiffersFromSource: team !== src.team,
      positionGroupDiffersFromSource: GROUP[landing.position] !== src.group,
    },
  };
}

const html = await (await fetch(SOURCE_URL, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
const source = parseSource(html);
const results = await mapLimit(source, 6, resolvePlayer);

const byLast = (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
const players = results.filter((r) => r.player).map((r) => r.player).sort(byLast);
const dupIds = players.filter((p, i) => players.findIndex((q) => q.nhlId === p.nhlId) !== i);
if (dupIds.length) throw new Error(`Duplicate NHL ids: ${dupIds.map((p) => p.name).join(", ")}`);

const audit = results.map((r) => r.audit).sort((a, b) => a.sourceName.localeCompare(b.sourceName));
const counts = audit.reduce((m, a) => ({ ...m, [a.status]: (m[a.status] ?? 0) + 1 }), {});
const generatedAt = new Date().toISOString();

mkdirSync(OUT_DIR, { recursive: true });
const meta = {
  season: SEASON,
  source: SOURCE,
  sourceUrl: SOURCE_URL,
  sourceUpdated: SOURCE_UPDATED,
  generatedAt,
  sourcePlayerCount: source.length,
  playerCount: players.length,
  note: "Membership only. Rankings, analysis and projections are intentionally not stored. Sorted by last name.",
};
writeFileSync(
  resolve(OUT_DIR, "2026-27.json"),
  JSON.stringify({ meta, players }, null, 0).replace(/\},\{/g, "},\n{") + "\n",
);
writeFileSync(
  resolve(OUT_DIR, "2026-27.audit.json"),
  JSON.stringify({ meta: { ...meta, statusCounts: counts }, entries: audit }, null, 2) + "\n",
);
console.log(`Resolved ${players.length}/${source.length}`, counts);
for (const a of audit.filter((x) => x.status !== "resolved")) console.log("UNRESOLVED", JSON.stringify(a));
for (const a of audit.filter((x) => x.teamDiffersFromSource)) console.log("TEAM CHANGED", a.sourceName, a.sourceTeam, "→", a.currentTeam);

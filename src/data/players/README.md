# SHIFT Player Catalog

`2026-27.json` is the **Player Catalog**: bundled, read-only NHL player reference data that powers every
"pick a player" flow in SHIFT: Add Player (Roster and setup), and Plan a Move (Add, Add + Drop). Users
search and select; team, position and headshot come with the player. Manual creation is the fallback for
anyone not in the catalog.

## Why the NHL.com Top 250

For the MVP, the catalog holds the players fantasy managers actually roster and stream. Membership is exactly the
250 players in NHL.com's **Fantasy hockey top 250 player rankings for 2026-27**:
<https://www.nhl.com/news/topic/fantasy/nhl-fantasy-hockey-top-250-200-rankings-drafts-players-big-board-281505474>

The ranking is used **only** to decide who's in. The catalog stores no rank, commentary or projections, it's
sorted by last name, and the app never shows or sorts by the ranking. Users see a "Player Catalog", not a
"Top 250". Search and UI don't depend on the count; only the 2026-27 validation requires exactly 250.

Source date: the page's structured data says published `2026-09-27T16:00:00Z`, modified
`2026-09-28T04:48:34Z`. Both are recorded in the catalog as `membershipSourcePublishedAt` /
`membershipSourceModifiedAt`, and the listed membership is snapshotted in
`docs/player-catalog/2026-27-source.json`, so the dataset is reproducible even if the article changes.

## Data

```jsonc
{
  "season": "2026-27",
  "playerCount": 250,
  "membershipSource": "NHL.com Fantasy Top 250",
  "membershipSourceUrl": "…",
  "membershipSourcePublishedAt": "…",
  "membershipSourceModifiedAt": "…",
  "generatedAt": "…",
  "players": [
    {
      "nhlPlayerId": 8478402,          // durable identity
      "firstName": "Connor",
      "lastName": "McDavid",
      "fullName": "Connor McDavid",    // official spelling, used for display
      "teamAbbrev": "EDM",             // SHIFT canonical team code (matches the schedule)
      "primaryPosition": "C",          // C | LW | RW | D | G
      "headshotUrl": "https://assets.nhle.com/mugs/nhl/20262027/EDM/8478402.png",
      "active": true
    }
  ]
}
```

- **NHL data is the authority** for id, current team, primary position, headshot and active status, all from
  `https://api-web.nhle.com/v1/player/{playerId}/landing`.
- **Position normalization:** NHL `C`→`C`, `L`→`LW`, `R`→`RW`, `D`→`D`, `G`→`G`. Any other code fails
  generation.
- **Primary position ≠ fantasy eligibility.** When a catalog player is added, `eligiblePositions` starts as
  `[primaryPosition]`. The user edits eligibility (e.g. C → C, LW) with Manage player; SHIFT never invents
  Yahoo/ESPN eligibility.
- **Headshots:** the official NHL `headshot` URL is stored (no bundled images) and rendered with a plain
  `<img>`; a missing or failed image falls back to SHIFT's neutral avatar. There's no `next/image`, so no
  remote-pattern config is involved.

## How identities are resolved

`scripts/refresh-player-catalog.mjs` (run `npm run catalog:refresh`):

1. Fetch the article and parse exactly 250 listed players (name, listed team, F/D/G). A broken rank sequence,
   an empty name, a duplicate name, or any count other than 250 fails loudly.
2. Index every 2026-27 roster (`/v1/roster/{TEAM}/20262027`) for SHIFT's canonical teams (read from
   `src/domain/nhl/teamIds.ts`).
3. Exact normalized full-name match; several matches → listed team, then position group. Not on a roster →
   NHL player search with the same exact-name rule. Nothing is guessed from a surname.
4. Fetch each landing record, verify the name, and take current team, position, headshot and status. If the
   current team differs from the article, the current team wins and the mismatch is reported.
5. Validate with `src/domain/players/validation.ts` (the same rules the tests run). Any unresolved player or
   validation failure → nothing is written, exit code 1.
6. Write the catalog (deterministic order) and the dev-only audit: `docs/player-catalog/2026-27-audit.md` and
   `2026-27-audit.json`.

Requests run 4 at a time with a 15 s timeout and exponential-backoff retries.

## Custom players

Players created manually are the user's own data (`source: "CUSTOM"`, `nhlPlayerId: null`) and live in the
user's local state, not in this file. They appear in the same search as the catalog afterward. Before a manual
player is saved, SHIFT checks for an existing catalog player with the same name (and offers it instead) or an
existing custom player with the same name and team.

## Runtime

The catalog is bundled with the app and searched in memory. The browser never calls NHL for players, and
the catalog is never copied into localStorage: only players the user adds or creates are persisted. If
the bundled file were ever invalid, the catalog loads empty with a notice and manual creation still works;
the test suite prevents that from shipping.

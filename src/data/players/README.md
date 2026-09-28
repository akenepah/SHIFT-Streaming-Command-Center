# NHL player catalog

`2026-27.json` is the searchable player catalog bundled with the app: 250 fantasy-relevant NHL players,
each with NHL player id, name, current team, primary position and NHL headshot URL. The app reads it
locally and never calls an NHL API at runtime.

| | |
|---|---|
| Season | 2026–27 |
| Membership | The 250 players in NHL.com's *Fantasy hockey top 250 player rankings for 2026-27* (updated 2026-09-27) |
| Player data | `api-web.nhle.com/v1/player/{id}/landing`: `currentTeamAbbrev`, `position`, `headshot`, `isActive` |
| Id resolution | `search.d3.nhle.com` player search, exact normalized full-name match; ties broken by the NHL.com-listed team, then position group; landing name verified |
| Order | Alphabetical by last name. **Rankings, analysis and projections are not stored or shown.** |

`2026-27.audit.json` records how every one of the 250 source names was resolved (method, NHL id, current team,
whether the team or position group differs from the source). Players that can't be resolved uniquely are
reported there and left out of the catalog; nothing is guessed.

Positions are the NHL primary position (L → LW, R → RW). Fantasy multi-position eligibility (e.g. C/RW) isn't in
NHL data; users can add it with Manage player after adding a player.

## Refreshing

```bash
node scripts/fetch-player-catalog.mjs
npm test
```

`src/domain/players/catalog.test.ts` validates the bundled file (count, unique ids, teams, positions, headshots,
no rank fields).

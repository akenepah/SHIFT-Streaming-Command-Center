# SHIFT — Streaming Command Center

Fantasy hockey weekly planner. **Maximize games played every week.**

You keep your fantasy roster up to date by hand. SHIFT reads the bundled 2026–27 NHL schedule, works out
each day's best legal lineup, and shows where you're wasting games (benched) and where you have open
capacity for streaming. Plan Add / Drop moves and see their effect on the rest of the week before you
make them in your league.

Private alpha: no accounts, no backend, no Yahoo integration, no runtime NHL API. Data lives in your browser.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Vitest domain tests (engine, schedule, transactions, overrides, persistence) |
| `npm run typecheck` | Next route typegen + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` / `npm start` | Production build / serve |

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Vitest.

## Screens

| Route | Screen |
|---|---|
| `/` | **Weekly Planner**: week navigation, NHL game density, day cards, Weekly Moves, Plan a move, one-day lineup overrides |
| `/roster` | Roster: add from list, create manually, edit team/positions/headshot, Active / Bench / IR+, drop |
| `/settings` | League Settings: names, lineup slots, bench/IR+, acquisition limit and reset day, goalie minimum, reset local data |
| `/setup` | First run: League & Lineup → Add Roster → Weekly Planner |

## Architecture

```
Fantasy roster ─► Player ─► NHL team ─► ScheduleProvider (static 2026–27 dataset)
                                             │
             planned moves ─► projected roster
                                             ▼
                              generateDailyLineup ─► generateWeek ─► React UI
                              (max-start matching,   (7 days +
                               overrides)             weekly totals)
```

- `src/domain/`: pure TypeScript with no React. It holds the engine and everything the tests cover.
  - `schedule/provider.ts`: the `ScheduleProvider` interface. `staticProvider.ts` reads the bundled JSON. A future
    `NHLApiScheduleProvider` only has to implement the same three methods.
  - `nhl/teams.ts`: the one canonical NHL team registry.
  - `lineup/assignment.ts`: maximum-start assignment.
  - `lineup/generateDailyLineup.ts`, `lineup/generateWeek.ts`: derived daily and weekly lineups.
  - `lineup/overrides.ts`, `transactions/`, `roster/projectedRoster.ts`, `settings.ts`, `config.ts` (league defaults).
- `src/state/`: app state, reducer, the versioned localStorage repository (`shift.streaming.v1`) and seed data.
- `src/components/`, `src/app/`: UI.

### How a day is derived

The fantasy roster is never changed by the planner. Each date is computed from roster + schedule + position
eligibility + league slots + planned moves + that day's overrides:

1. **IR+** players never start, even if their team plays.
2. Players whose team has **no game** go to `noGame` and use no slot.
3. Players whose team **plays** are assigned to active slots (C, LW, RW, D, UTIL, G; UTIL takes any skater,
   never a goalie) by **maximum bipartite matching** (Kuhn's augmenting paths). Multi-position players are
   moved around so the number of starters is maximal, e.g. C/RW + C fill C and RW instead of benching one.
   Candidates are processed in priority order (roster status Active before Bench, then roster order), which
   makes the result deterministic and lets higher-priority players win ties.
4. Playing players who still don't fit are **benched games**. Unused active slots are **open slots**.

### Planned moves

`ADD`, `DROP`, `ADD_DROP` records with an effective date. From that date on, the projected roster reflects the
move; earlier days are untouched. Adds and Add + Drops use one acquisition, Drops none. Acquisitions count per
league week (Monday reset by default). Cancelled moves are ignored everywhere.

### Daily overrides

Clicking a player in a day card lets you pin them to another legal slot, or to the bench, for **that date
only**. The engine then re-optimizes everyone else around the pin. An override that stops making sense (the
player was dropped, their team no longer plays, the slot was removed in settings) is ignored and that day falls
back to the automatic lineup. **Reset day lineup** clears a day's overrides.

## Dates

Every date is an NHL calendar-date string `YYYY-MM-DD`: the date the NHL lists the game under. Dates are never
derived from UTC start times (a 7:30 pm Pacific game is next-day UTC but stays on its listed date). Date math
runs in UTC on those strings, so the browser time zone can't shift a game. "Today" comes from your local clock.

## Schedule data

`src/data/nhl/2026-27.json`: 1,344 regular-season games (32 teams × 84), 2026-09-29 → 2027-04-10, from the
NHL public web API, retrieved 2026-09-27. See `src/data/nhl/README.md`. Refresh with
`node scripts/fetch-nhl-schedule.mjs`.

## Roster status vs. daily lineup

Two different things, deliberately kept apart:

- **Roster status** (stored, set by you on the Roster screen) says what your fantasy roster contains:
  `ACTIVE`, `BENCH` or `IR_PLUS`. Active and Bench are only a priority: when more players have games than
  there are legal slots, Active players get first pick. IR+ players never start.
- **Daily lineup** (derived, never stored) is who starts on a given date: computed from roster + schedule +
  eligibility + slots + planned moves + that day's overrides.

So a player marked Bench still starts on any day their team plays and a legal slot is free. The planner's
roster summary reports inventory ("24 rostered · IR+ 1/4"), not starters.

## Local data

Everything is stored in this browser's `localStorage` under `shift.streaming.v2`: settings, player registry,
roster, planned moves, overrides, and any players that need repair. A fresh browser starts **empty**: league
defaults, no players, no roster. Setup (League & Lineup → Add Roster → Weekly Planner) can be finished with any
number of players, even zero.

- **Legacy demo data (v1).** The first alpha build seeded a sample roster under `shift.streaming.v1`. On first
  load that payload is migrated once. Sample players whose records are exactly the original seed are removed,
  along with their roster entries, planned moves and overrides. Players you created, sample players you edited
  (team, positions, name or headshot), and your settings are kept. The original payload is saved to
  `shift.streaming.v1.migrated-backup` and the v1 key is deleted, so the sample roster can't come back, even
  after a reset.
- **Malformed players** (unknown team, no valid positions, no name) aren't dropped. They move to a "needs repair"
  list on the Roster screen, where you can fix them (they rejoin the roster with their old status) or remove them.
- **Unreadable data** starts the app fresh. A copy is kept under `shift.streaming.v2.corrupt`.
- **League Settings → Reset local data** erases everything and returns to first-run setup.

Players are entered by hand (name, NHL team from the 32-team registry, eligible positions, optional headshot).
Adding a player whose name matches someone already on your roster asks for confirmation first.

# Stabilization and UX validation — September 30, 2026

## Baseline and scope

Started with clean main at `4378b1978064e76d73d27053609bfb0f31cae79e` and staging at `25f57e49d2f67bceeef8f30fa9e6ecda4e0199fc`. Their code trees matched. Staging was fast-forwarded to the existing main merge before creating `feature/final-stabilization-ux`. This pass does not modify main, Figma, the maximum-matching engine, or the Planner architecture.

## Changes

- Base-roster drops warn about retained planned moves and future lineup choices before confirmation. Cancel preserves the roster. Confirmed drops retain moves; invalid moves visibly say **Needs fixing**, explain the reason, and state that no add is counted until fixed.
- Repeated roster additions keep the dialog open, clear search, and restore input focus. Enter adds only a single unambiguous, unrostered search result; empty, ambiguous, and already-rostered searches do nothing.
- First Planner visit offers a compact, dismissible three-step introduction. Dismissal is stored locally per account and, for signed-in users, in their Supabase user metadata. Cloud metadata persistence remains pending live validation; offline dismissal still works locally.
- Contextual, keyboard-accessible help explains Schedule Targets/B2B, UTIL, IR+, weekly adds, and daily lineup capacity. Slot-launched additions name the day and position and show the date.
- Setup has clearer grouping and reassurance. Its summary now describes the selected reset-day week rather than always claiming Monday–Sunday.
- Phone navigation uses an intentional second row. The roster shows player, NHL team, positions, status, and action menu without needing to scroll sideways for actions. Dialogs use dynamic viewport heights; key action targets are larger.
- The Planner keeps horizontal day scrolling. Its wrapper now contains overflow that previously escaped onto the page. The scroller is keyboard-focusable.
- Menus support Arrow Up/Down, Home/End, and Escape. Account popovers clamp vertically as well as horizontally.
- Failed cloud writes can retry without discarding in-memory edits. Retry is limited to actual failed writes: a failed bootstrap only reloads. Original revision checks continue to reject conflicts.
- Background cloud refresh uses a separate repository instance, so its read cannot advance the revision of an in-flight writer. Team switching/new-team creation also check for account or generation changes after waiting for saves.

## Automated validation

`npm test`: **362 tests passed in 35 files**. Baseline was 346/32. New coverage includes 4 drop-impact cases, 5 orientation cases, 5 rapid-entry safety cases, and 2 real-SQL cloud retry/concurrency cases. Existing auth, migration idempotency, RLS, account selection, lineup matching, planned moves, and Schedule Targets suites pass.

`npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` passed. The production build generated all application routes. Next.js printed only the known warning about a package-lock outside the repository. No `file 2.ext` duplicates were found under src.

## Browser checks

Used disposable local data at `http://127.0.0.1:3212/`. Production smoke ran `next start` against the production build on that origin; real user teams were not modified.

- Rapid additions: McDavid and four goalies, with search cleared/refocused; keyboard Enter verified. Hughes, Makar, and Pettersson results retain expected ordering and distinct eligibility.
- Roster drop: cancel preserves the player; Drop anyway retains the planned transaction and shows its repair reason. Re-adding the player repairs the underlying roster dependency.
- Introduction dismissal survives refresh. Contextual help opens and closes with keyboard focus restoration.
- One, two, and five local teams; long team name; empty names for new setup; distinct rosters; selected team restored; cancel returns to original team.
- Account keyboard End reaches the last action; Escape closes. Setup validation focuses the first invalid field. Five-team menu fits on phone.
- Schedule Targets click-through selects the intended NHL team. Slot addition opens a day/position-specific dialog.
- Four-goalie lineup: selected Allen remains at G while McDavid moves C → UTIL. Exact Undo verified using stable accessible slot identities. An earlier raw-text comparison differed because image placeholders changed while images loaded.
- Native C1 → C2 drag succeeded; exact Undo restored slot identities. Next Monday appears separately. Existing exhaustive legality/matching/stale-pin tests pass; this pass did not rerun every prior drag permutation manually.
- Production routes `/`, `/roster`, `/settings`, `/setup`, `/setup?step=1`, and `/setup?step=2` loaded without console errors; completed setup continues to route back to the Planner. New-team setup and cancel also passed.
- Phone auth dialog fits at 390×844 (16-pixel side margins); no live email submitted.
- No unexplained production console errors or warnings in the inspected tab.

## Responsive matrix

Planner, Roster, Settings, and Setup were checked at 1920, 1440, 1280, 1024, and 390 pixels. Final document scroll width matched viewport width at every width. The Planner's own scroller remains intentionally wider. Browser testing caught and corrected an intermediate mobile roster column-width issue and Planner page overflow.

## Hosted auth and release blockers

The existing hosted staging URL was inspected:
`https://shift-streaming-command-center-git-8e3c08-pixel-perfect-designs.vercel.app/`

Its signed-out setup/account/auth surfaces loaded. This was the previous deployment, not proof of deployment of this branch.

No Supabase or Resend provider connector/dashboard session was available. The user was asked for non-secret effective SMTP sender/name/host/username, Auth Site URL/allowed redirects, and the currently verified Resend domain. No response has been received as of this report. Per the request, another magic link must not be sent before effective configuration is verified.

Therefore these are **not passed**: current effective SMTP configuration, live magic-link delivery, desktop/mobile callback and session persistence, hosted bidirectional cross-device changes, and hosted cache-clear restoration. Existing SQL/RLS integration tests pass, but do not substitute for those hosted acceptance tests. The previous SMTP failure and diagnostic history remain in auth-validation.md.

This code is locally validated, but the release must not be labeled ready until deployment and those live acceptance checks pass.

## Future product scope

A dedicated single-day phone Planner could improve convenience further. This pass preserves the requested horizontally scrolling Planner architecture and provides keyboard/touch alternatives.

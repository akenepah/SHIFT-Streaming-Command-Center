# Existing local teams → cloud accounts

Completed local teams are discovered independently of whether an authenticated account already has cloud teams. The account dialog offers one-click adoption of one or all teams; Not now keeps the sources available through the account menu.

Each source gets a durable origin key. The existing database uniqueness constraint on owner and origin prevents duplicate creation. Legacy teams can match by complete persisted content, never by name alone. Existing cloud versions remain authoritative.

Adoption claims the local source for the current account, uploads through the existing atomic workspace RPC, independently reads it back, and compares persisted settings, players, roster, planned moves, and lineup overrides before marking completion. Local source data is retained. Failed uploads and mismatched readbacks do not complete migration. A lost success response can recover by exact origin lookup. Account and session generation checks prevent stale asynchronous results from entering a different session.

Owned local sources are hidden from signed-out sessions and other accounts. Migration markers are account-scoped. Database RLS continues to enforce cloud isolation. This change requires no new database migration.

Cloud writes use a serialized queue that releases its lock after empty flushes, successful writes, and failures. This fixes a browser-discovered case where switching teams could leave later edits unsaved. Reopening migration first flushes pending cloud edits.

## Validation scope

Regression tests execute the real SQL migrations and RLS in PGlite with a simulated Supabase transport. They cover preservation, idempotency, legacy content matching, newer cloud precedence, extra teams, failed/mismatched writes, lost replies, account changes, cache restoration, and isolation.

Disposable browser QA used the same SQL with simulated authentication. It verified bulk adoption, postponement/reopening, extra-team adoption, account switching, independent-origin restoration, clearing site data and restoring, cloud-first setup, and subsequent saved edits. It also checked lineup moves, goalie stability, drag/drop, exact Undo, and Next Monday against migrated data. Migration dialogs fit 1920, 1440, 1280, 1024, and 390-pixel viewports without horizontal overflow.

These checks are not a successful hosted Supabase or physical mobile magic-link acceptance test. Live email delivery and real desktop/mobile callback/session validation remain deferred at the user's request; see auth-validation.md.

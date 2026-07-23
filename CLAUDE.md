# Kapsoon — working notes

## Stack

Next.js 16 App Router · React 19 · TypeScript 5.9 · Tailwind v4 · oxlint · oxfmt · Vitest.
Mobile-first (Samsung S24 Ultra target), dark mode default. Deploy: Vercel.

## Feature-based architecture

Organize by DOMAIN, not layer. A feature owns its hooks, components, and tests under
`src/features/<domain>/`. `src/shared/` holds cross-cutting helpers only.
**Dependency rule:** `features → shared`, never back. Cross-feature reuse graduates to `shared/`.

`src/features/coffee/` is the only domain feature: an offline-first SQLite ledger of capsule
movements (a signed `delta` per event — negative for a cup drunk, positive for an order) with
integer minor-unit amounts. It replaced the scaffold's `ledger/` worked example.

## TypeScript house bans (enforced by tsc + oxlint where possible)

No `any`, no `as` casts (`as const` is fine), no `!`, no `// @ts-*`. `type` over `interface`.
Prefer `for..of`. Use type guards to narrow `unknown`. Money is always an integer minor-unit
`number` — never a float (see `coffee/db.ts`'s `assertIntegerMinor` guard).

## Data layer: SQLite (SQLocal + OPFS) via Drizzle

Real SQL in the browser: SQLocal (`@sqlite.org/sqlite-wasm`) persists to OPFS, queried through
`drizzle-orm/sqlite-proxy` — see `src/features/coffee/db.ts` / `schema.ts`. Offline-first,
single-user, no auth. **Requires cross-origin isolation** (`next.config.ts` sets
`Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin`) — don't
remove those headers, OPFS persistence silently breaks without them. Solid on Android/Chrome;
weaker on iOS Safari. Backup is NOT the `.sqlite` file: `coffee/backup.ts` serializes the movement
log to JSON and writes it as `.txt` (not `.json`) because Chromium's share-sheet allowlist refuses
JSON outright — the MIME must stay exactly `text/plain`. Keep UI components data-layer-agnostic:
they import the feature's `use-*.ts` hook, never `db.ts` directly.

## Theme

Tokens live in `src/app/globals.css @theme`. Swap `--color-accent` to reskin. To re-theme
from https://getdesign.md/, map a design's palette onto the existing token names (see DESIGN.md).
One typeface only; figures use `.tnum` (tabular-nums) — never a mono (plain-zero rule).

## Quality gates (all must pass)

`npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`

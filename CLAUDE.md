# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

InstaPlanner: a private, local-only Instagram/Facebook publishing planner. Polish UI. Single-user, single-Mac app — no cloud server, no Meta API integration. Publication is always manual; the app never posts anything itself. It prepares ready-to-upload export folders on disk.

## Commands

```sh
npm run dev          # dev server on 127.0.0.1:3210
npm run build         # next build --webpack (webpack, not turbopack — intentional)
npm start             # production server on 127.0.0.1:3210
npm run typecheck     # tsc --noEmit
npm test              # node --import tsx --test tests/*.test.ts (node:test, not vitest)
npm run test:e2e      # playwright test
npm run backup        # node --env-file=.env.local --import tsx scripts/backup.ts
npm run restore -- "<backup-path>" "<new-empty-data-dir>"
```

Run a single node:test file: `node --import tsx --test tests/store.test.ts`.
Run a single Playwright test: `npx playwright test tests/e2e/planner.spec.ts -g "test name"`.

Do not run `dev` and `start` against the same port simultaneously — both bind the fixed port 3210.

## Architecture

Next.js App Router (`src/app`), but this is not a typical multi-route Next app: almost the entire backend is one catch-all API route, and almost the entire frontend is one client-rendered planner page.

- `src/app/api/[...path]/route.ts` — the single API entry point. All HTTP verbs route through one `handle()` function that dispatches on `[resource, id, action]` path segments (e.g. `/api/posts/:id/schedule`, `/api/media/:id/thumbnail`). All write operations run through `store.lock(...)`.
- `src/server/store.ts` — the `Store` class: the real application core (db access, posts/media/accounts CRUD, scheduling, queue/export packaging, backup/restore). Holds a serialized write queue (`lock`) so concurrent requests can't race on SQLite + filesystem state together.
- `src/server/database.ts` — SQLite setup via `better-sqlite3`, schema migrations keyed on `user_version`.
- `src/server/files.ts` — all filesystem safety primitives: resolves the configured data root (must live outside the repo), rejects symlinks at every path component, `safePath()` guards against path traversal, directory bootstrap, recursive tree copy for backups.
- `src/server/http.ts` — request-level guards: loopback-only host allowlist, origin/`sec-fetch-site` checks (defense against browser-based cross-origin requests even though there's no auth), JSON body size limits.
- `src/server/ai.ts` — optional OpenAI caption suggestion (Responses API, single request, no retries). Only active if `OPENAI_API_KEY` is set.
- `src/components/Planner.tsx` and `PostEditor.tsx` — the bulk of the frontend: calendar (FullCalendar) + post editor. `AccountSettings.tsx` for account management. `components/api.ts` is the thin fetch client for the API route.
- `src/lib/types.ts` — shared domain types (`Account`, `Media`, `Post`, `ExportState`) plus pure helpers (`todayWarsaw`, `isOverdue`, `missingParts`) used by both server and client.

### Data directory layout

All runtime state lives outside the git repo, under `INSTAPLANNER_DATA_DIR` (default `~/Pictures/InstaPlanner-data`). Never create code paths that write inside the repo itself — `configuredRoot()` actively rejects a root that overlaps `process.cwd()`.

```
InstaPlanner-data/
  instaplanner.sqlite
  media/<accountId>/<mediaId>.<ext>        # imported originals, byte-identical copies
  miniatury/<mediaId>.jpg                   # thumbnails (sharp / ffmpeg for video)
  kolejka/<account>/<date>-<title>-<postId>/   # pending queue export packages
  eksporty/<account>/...                    # on-demand history re-exports
  backups/<date-and-id>/...                 # full consistent backups (SQLite backup API)
```

### Key invariants to preserve when touching store/files code

- One publication per account per day, enforced even against history.
- Post state is persisted to SQLite *before* any filesystem operation; a failed export/cleanup must never lose data or the last good package. Overdue status (`isOverdue`) is a display computation in Europe/Warsaw time, never itself a write.
- Marking a post "published" deletes its `kolejka` package; unmarking restores it. "Replay package from history" writes to `eksporty` only, never changes publish status.
- Exports copy original bytes — no re-encoding, no quality loss. Caption text lives separately from `podpis.txt`; title/notes never leak into it.
- All filesystem paths derived from user/db input go through `safePath()` (symlink + traversal rejection). Don't bypass it with raw `path.join` + `fs` calls.
- `store.lock()` wraps every mutating store method — new mutating operations must go through it too, and new API actions must call them inside `store.lock(() => ...)`.
- Deleting an account with post history is blocked; deleting media in use by a post is blocked.

### Security model

There is no auth — safety instead comes from strict loopback-only binding (`http.ts` checks `Host`/`Origin`/`sec-fetch-site`) and filesystem containment (`files.ts`). Preserve both whenever editing request handling or path logic.

## Conventions

- Plain hyphen (`-`) instead of em dash, everywhere — code, commit messages, Polish UI copy.
- CSS is hand-written (`globals.css`), no Tailwind, no CSS-in-JS.
- FullCalendar is used via its free, MIT-licensed core modules only.
- Comments in the codebase explain non-obvious *why* (race conditions, manual verification notes), not what.
- `docs/STATUS.md` tracks implementation stage, verification status, and known limitations — check it before assuming a feature is unfinished or missing.

# Engagekit — Multi-Account Engagement Copilot for Threads

Engagekit is a **human-in-the-loop** scraping and response-assist tool for Threads.
It helps teams:

- collect posts
- triage relevance
- generate draft replies
- manually review everything before any engagement

No auto-posting is required in the default workflow.

---

## Platform Support

- **Threads**: ✅ authentication + scraping supported
- **X (Twitter)**: 🚧 in progress (authentication/scraping not yet working)

---

## Quick Start (Local, First-Time Setup)

If you only need a clean first run on your machine, follow this section only.

### 1) Prerequisites

- **Bun** (latest stable)
- Linux/macOS/Windows environment that can run Playwright Chromium
- Git

> SQLite is file-based and bundled via dependencies — no DB server setup needed.

### 2) Install dependencies

```bash
bun install
bunx playwright install chromium
```

If Chromium install fails on Linux due to missing system packages, run Playwright's dependency helper for your distro, then retry.

### 3) Configure environment

```bash
cp .env.example .env
```

For first run, these are the important defaults:

- `DATABASE_PATH=./data/app.db`
- `PLAYWRIGHT_HEADLESS=true`
- `API_ENABLED=false` (CLI-only is fine to start)
- `TRIAGE_ENABLED=false`
- `DRAFTS_ENABLED=false`

> You only need `OPENROUTER_API_KEY` if you enable triage/drafts.

### 4) Run DB migration

```bash
bun run db:migrate
```

### 5) Sanity check

```bash
bun run typecheck
bun test
bun run cli --help
```

If all three commands work, your local setup is healthy.

### 6) Authenticate one Threads account

```bash
bun run cli accounts:add --platform threads --handle yourhandle --name "Your Name"
bun run cli auth:login --account 1
bun run cli auth:check --account 1
```

### 7) Run a first scrape

```bash
bun run cli scrape:account --account 1
bun run cli runs:list
```

If `runs:list` shows a new run, your end-to-end local setup is working.

---

## Minimal `.env` for First Success

Use this baseline for local onboarding (adjust if needed):

```env
DATABASE_PATH=./data/app.db
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_SLOW_MO=0

LOG_LEVEL=info
LOG_PRETTY=true

TRIAGE_ENABLED=false
DEEP_SCRAPE_ENABLED=false
DRAFTS_ENABLED=false
API_ENABLED=false
SCHEDULER_ENABLED=false

API_HOST=127.0.0.1
API_PORT=3000
```

Add LLM config only when enabling triage or drafts:

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=google/gemini-2.5-flash
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

---

## Running Modes

## 1) CLI (main workflow)

Start with help:

```bash
bun run cli --help
```

Typical daily commands:

```bash
bun run cli scrape:daily --platform threads
bun run cli scrape:account --account 1
bun run cli pipeline:run --run-account 1
```

Inspect outputs:

```bash
bun run cli runs:list
bun run cli queue:list --status pending
bun run cli triage:list --run-account 1
bun run cli drafts:list --run-account 1
```

## 2) API server

```bash
bun run api
```

Default address: `http://127.0.0.1:3000` (controlled by `API_HOST` and `API_PORT`).

## 3) Web dashboard (dev)

```bash
bun run web:dev
```

Vite UI runs on `http://localhost:5173` and proxies to API.

Production build:

```bash
bun run web:build
```

## 4) Docker (optional)

```bash
docker compose up -d --build
docker compose logs -f engagekit engagekit-web
docker compose down
```

SQLite data persists under `./data`.

---

## Authentication Notes

### Persistent browser sessions (Threads)

Engagekit uses persistent browser profiles to keep login state stable between runs:

```text
data/sessions/profiles/threads-account-<id>/
```

Each account gets an isolated profile (cookies/localStorage/session context). If persistent context fails, it falls back to DB-backed `storageState` session handling.

### Remote-server session blob (advanced)

Use this only when you need to move authenticated state between machines.

```bash
# On local machine where login already exists
bun run cli auth:export --account 1 --ttl 600

# On remote machine (same SESSION_BLOB_SECRET)
bun run cli auth:import --account 1 --blob "<SESSION_BLOB>"
```

Required env for both machines:

- `SESSION_BLOB_SECRET` (same value, minimum 16 chars)
- compatible TTL (`SESSION_BLOB_TTL_SECONDS`)

---

## Troubleshooting (Top Issues)

### Playwright install fails

- Re-run `bunx playwright install chromium`
- On Linux, install missing OS dependencies and retry

### `auth:check` fails after successful login

- Session may be expired/challenged by platform
- Re-run `bun run cli auth:login --account <id>`
- Ensure account profile directory is writable

### Pipeline commands produce little/no triage or drafts

- Check feature flags in `.env`:
  - `TRIAGE_ENABLED=true`
  - `DRAFTS_ENABLED=true`
- Ensure `OPENROUTER_API_KEY` is set

### API not reachable

- Ensure `API_ENABLED=true` when using API mode
- Confirm host/port (`API_HOST`, `API_PORT`)
- In Docker, ensure container is up and port mapped

### No data appears in UI

- Verify API is running and accessible
- Check `VITE_API_PROXY_TARGET` when using Docker web service

---

## Use Cases

- **Social listening with context**: monitor mentions, replies, and related threads across accounts
- **Human-reviewed engagement**: generate AI drafts while keeping final approval manual
- **Team moderation workflow**: prioritize high-value posts and reduce low-signal interactions
- **Prompt feedback loop**: track draft outcomes and improve prompt quality over time
- **Scheduled operations**: recurring scrape/pipeline jobs with cron commands

---

## README for Coding Agents

If you are an autonomous coding agent in this repo:

1. Read `AGENTS.md` first (source of truth for workflow)
2. Keep changes focused and style-preserving
3. Run targeted tests, then:

```bash
bun run typecheck && bun test
```

4. Keep responsibilities separated:
   - DB logic: `src/db/repositories/`
   - domain schemas: `src/domain/`
   - LLM calls: `src/llm/openrouter-client.ts`
5. Never commit `.env` or runtime artifacts in `data/sessions/*`

Quick test loops:

```bash
bun test tests/unit/hash.test.ts
bun test -t "should produce consistent hashes"
bun test hash
```

---

## Contributing

Focused contributions are welcome.

1. Create a branch per change
2. Keep PR scope tight (one feature/fix)
3. Follow TypeScript strict-mode and existing style
4. Add/update tests for behavior changes
5. Run quality checks before opening PR:

```bash
bun run typecheck
bun test
cd web && bun run lint
```

6. In your PR description, include:
   - what changed
   - why it changed
   - how it was tested

---

## License

MIT

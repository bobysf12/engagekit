# Multi-account Engagement Copilot for X/Threads

Engagekit is a human-in-the-loop scraping and response-assist tool for Threads and X. It helps teams collect posts, triage relevance, generate draft replies, and review everything manually before any engagement.

## Prerequisites

- Bun (latest stable)
- Node-compatible system dependencies for Playwright Chromium
- SQLite (file-based; no server setup needed)
- OpenRouter API key for LLM-powered triage/drafts (`OPENROUTER_API_KEY`)
- A local `.env` file based on `.env.example`

Optional for containerized setup:
- Docker + Docker Compose

## How to Install

From the repository root:

```bash
bun install
bunx playwright install chromium
cp .env.example .env
bun run db:migrate
```

Recommended first checks:

```bash
bun run typecheck
bun test
```

## How to Run

### CLI (main workflow)

- Start with command help:

```bash
bun run cli --help
```

- Add and authenticate an account:

```bash
bun run cli accounts:add --platform threads --handle yourhandle --name "Your Name"
bun run cli auth:login --account 1
bun run cli auth:check --account 1
```

- Remote-server MVP auth via session blob:

```bash
# On local machine where login already exists
bun run cli auth:export --account 1 --ttl 600

# On remote server (same SESSION_BLOB_SECRET), paste blob output
bun run cli auth:import --account 1 --blob "<SESSION_BLOB>"
```

- Run scraping and pipeline:

```bash
bun run cli scrape:daily --platform threads
bun run cli scrape:account --account 1
bun run cli pipeline:run --run-account 1
```

### Persistent Browser Sessions (Threads)

For Threads scraping, the system uses persistent browser contexts to maintain login state across runs and reduce block/challenge risk. Profile data is stored in:

```
data/sessions/profiles/threads-account-<id>/
```

Each account gets its own isolated browser profile, preserving cookies, localStorage, and other session artifacts between runs. This makes scraping behavior more "sticky" and human-like.

If persistent context fails, the system falls back to the traditional storageState approach using the session blob in the database.

- Inspect output:

```bash
bun run cli runs:list
bun run cli queue:list --status pending
bun run cli triage:list --run-account 1
bun run cli drafts:list --run-account 1
```

### API server

```bash
bun run api
```

Default API address: `http://127.0.0.1:3000` (controlled by `API_HOST` and `API_PORT`).

### Web dashboard

```bash
bun run web:dev
```

Vite dev UI runs on `http://localhost:5173` and proxies to the API.

Production build:

```bash
bun run web:build
```

### Docker (optional)

```bash
docker compose up -d --build
docker compose logs -f engagekit engagekit-web
docker compose down
```

The SQLite database persists in `./data`.

## Use Cases

- **Social listening with context**: Collect and monitor mentions, replies, and related discussion across multiple accounts.
- **Human-reviewed engagement**: Generate LLM draft responses while keeping final approval fully manual.
- **Team moderation workflow**: Use queue/triage to prioritize high-value posts and avoid low-signal interactions.
- **Prompt feedback loop**: Store draft selection feedback to improve future output quality over time.
- **Scheduled operations**: Run recurring scrape/pipeline jobs with cron commands for ongoing monitoring.

## README for Coding Agents

If you are an autonomous coding agent working in this repo:

1. Read `AGENTS.md` first; it is the source of truth for agent workflow.
2. Use focused, minimal changes and preserve style in touched files.
3. Run targeted tests for edited areas, then run:

```bash
bun run typecheck && bun test
```

4. Keep DB logic in `src/db/repositories/`, domain schemas in `src/domain/`, and LLM calls in `src/llm/openrouter-client.ts`.
5. Never commit `.env` or runtime artifacts under `data/sessions/*`.

Quick test commands for agent loops:

```bash
bun test tests/unit/hash.test.ts
bun test -t "should produce consistent hashes"
bun test hash
```

## Contributing

We welcome focused contributions.

1. Create a branch for your change.
2. Keep PRs scoped (one feature/fix per PR).
3. Follow TypeScript strict-mode and existing naming/style conventions.
4. Add or update tests when behavior changes.
5. Run quality checks before opening a PR:

```bash
bun run typecheck
bun test
cd web && bun run lint
```

6. Include in your PR description:
   - What changed
   - Why it changed
   - How you tested it

## License

MIT

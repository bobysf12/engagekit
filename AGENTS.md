# AGENTS.md

Guidance for coding agents working in `engagekit`.

## Project Snapshot
- Runtime: Bun + TypeScript (ESM)
- CLI entrypoint: `src/cli/index.ts`
- Database: SQLite + Drizzle ORM
- Scraping: Playwright
- LLM: OpenRouter (via OpenAI SDK)
- Validation/config: Zod + dotenv
- Logging: Pino

## Architecture Overview

Engagekit is a social media engagement pipeline tool with these stages:
1. **Scrape** - Collect posts from Threads/X (light fields)
2. **Triage** - LLM scores posts for relevance (0-100)
3. **Selection** - Keep top N posts with score > threshold
4. **Deep Scrape** - Fetch comments/context for selected posts
5. **Draft Generation** - LLM creates 3 reply options per post
6. **Feedback** - User selects draft; stored for prompt conditioning

## Important Paths
- `src/cli/` - command wiring and subcommands
- `src/core/` - shared utilities (`config`, `logger`, `errors`, `retry`, etc.)
- `src/db/` - schema, repositories, migration runner
- `src/db/repositories/` - data access layer (one file per domain)
- `src/domain/` - domain models and Zod schemas
- `src/llm/` - LLM client and prompts (OpenRouter)
- `src/orchestration/` - scrape coordinator, pipeline coordinator
- `src/orchestration/stages/` - individual pipeline stages
- `src/platforms/` - platform adapters (`threads`, `x`)
- `src/services/` - domain services (policy snapshots, delete service, etc.)
- `src/server/` - Express API server and routes
- `src/server/routes/` - API route modules
- `tests/unit/` - unit tests
- `tests/integration/` - integration tests
- `data/` - local DB and runtime artifacts (mostly gitignored)

## Setup Commands
Run from repository root:

```bash
bun install
bunx playwright install chromium
cp .env.example .env
bun run db:migrate
```

## Build / Lint / Test Commands
There is no dedicated `build` script and no dedicated lint config at this time.

### Core quality checks
```bash
bun run typecheck
bun test
```

### Single-test workflows (important)
Run one file:

```bash
bun test tests/unit/hash.test.ts
```

Run by test name regex:

```bash
bun test -t "should produce consistent hashes"
```

Run by filename token:

```bash
bun test hash
```

Coverage:

```bash
bun test --coverage
```

### Runtime/manual checks
```bash
bun run cli --help
bun run cli accounts:list
bun run cli policy:get --account 1
bun run cli triage:list --run-account 60
bun run cli drafts:list --run-account 60
bun run dev
```

## Database / Migration Commands
```bash
bun run db:generate
bun run db:migrate
bun run db:push
bun run db:studio
```

## Recommended Agent Workflow
For most code changes, run:

```bash
bun run typecheck && bun test
```

For narrow edits, run targeted tests first, then full test suite before handoff.

## CLI Commands Reference

### Account Management
```bash
bun run cli accounts:list
bun run cli accounts:add --platform threads --username <handle>
bun run cli auth:login --account <id>
bun run cli auth:status --account <id>
```

### Engagement Policy
```bash
bun run cli policy:get --account <id>
bun run cli policy:set --account <id> --topics "topic1, topic2" --tone casual --goals "engage, support"
bun run cli policy:delete --account <id>
```

### Scraping
```bash
bun run cli scrape:run --account <id> --source home --limit 50
bun run cli scrape:run --account <id> --source profile --target <handle>
bun run cli pipeline:run --run-account <id>  # Run pipeline on existing scrape
```

### Triage & Drafts
```bash
bun run cli triage:list --run-account <id>
bun run cli triage:list --account <id> --min-score 75
bun run cli drafts:list --run-account <id>
bun run cli drafts:select --draft <id> --option 1
bun run cli drafts:reject --draft <id>
bun run cli drafts:feedback --draft <id> --feedback "Great option!"
```

### Cron Jobs
```bash
bun run cli cron:create --account <id> --source home --cron "0 9 * * *"
bun run cli cron:list
bun run cli cron:enable --id <id>
bun run cli cron:disable --id <id>
bun run cli cron:delete --id <id>
bun run cli cron:history --id <id>
```

## API Server

Start the API server:
```bash
bun run api
```

The API runs on `http://127.0.0.1:3000` by default. Enable it with `API_ENABLED=true` in `.env`.

### Endpoints

#### Health
- `GET /health` - Server health check

#### Runs
- `GET /api/runs` - List recent runs (query: `limit`)
- `GET /api/runs/:id` - Get run with accounts
- `DELETE /api/runs/:id` - Delete run with cascade
- `GET /api/runs/:id/accounts` - List run accounts
- `DELETE /api/runs/accounts/:runAccountId` - Delete run account with cascade

#### Posts
- `GET /api/posts` - List posts (query: `limit`, `offset`, `platform`, `sourceAccountId`)
- `GET /api/posts/:id` - Get post with comments
- `DELETE /api/posts/:id` - Delete post with cascade
- `GET /api/posts/:id/comments` - Get post comments

#### Triage
- `GET /api/triage` - List triage (query: `limit`, `runAccountId`, `minScore`, `label`, `selectedOnly`)
- `GET /api/triage/:id` - Get triage record
- `GET /api/triage/run-account/:runAccountId` - List triage for run account
- `GET /api/triage/run-account/:runAccountId/top20` - List top 20 posts
- `GET /api/triage/run-account/:runAccountId/selected` - List posts selected for deep scrape

#### Drafts
- `GET /api/drafts` - List drafts (query: `runAccountId`, `postId`)
- `GET /api/drafts/:id` - Get draft
- `POST /api/drafts/:id/select` - Select draft (body: `selectedBy`, `metadata`)
- `POST /api/drafts/:id/reject` - Reject draft
- `GET /api/drafts/post/:postId/feedback` - Get feedback for post

#### Policies
- `GET /api/policies/account/:accountId` - Get active policy for account
- `PUT /api/policies/account/:accountId` - Update policy (body: `name`, `topics`, `goals`, `avoidList`, `toneIdentity`, `preferredLanguages`)
- `DELETE /api/policies/account/:accountId` - Deactivate policy

#### Cron Jobs
- `GET /api/cron` - List cron jobs (query: `accountId`)
- `GET /api/cron/:id` - Get cron job
- `POST /api/cron` - Create cron job (body: `accountId`, `name`, `cronExpr`, `timezone`, `pipelineConfig`)
- `PUT /api/cron/:id` - Update cron job
- `POST /api/cron/:id/enable` - Enable cron job
- `POST /api/cron/:id/disable` - Disable cron job
- `DELETE /api/cron/:id` - Delete cron job
- `GET /api/cron/:id/history` - Get job run history (query: `limit`)

## Code Style Guidelines
These are inferred from existing code and config.

### Language and modules
- Use TypeScript for source code.
- Use ESM imports/exports (`"type": "module"`).
- Prefer named exports; use `export default` only where a tool contract requires it (e.g. `drizzle.config.ts`).
- Keep modules focused and colocate by feature.

### Formatting
- 2-space indentation.
- Semicolons required.
- Use double quotes.
- Keep trailing commas for multiline lists/objects/args.
- Wrap long chains/argument lists for readability.

### Imports
- Use `import type` for type-only imports.
- Preferred ordering: external packages, then internal modules.
- Use relative imports (`./`, `../`) as in existing files.
- Remove unused imports; `bun run typecheck` catches drift.

### Types and modeling
- `tsconfig` is strict; keep new code strict-safe.
- Prefer domain types from `src/domain/models.ts` and Drizzle inferred types from `src/db/schema.ts`.
- Use narrow unions for statuses/platforms; avoid free-form strings.
- Prefer `unknown` + narrowing over new `any` usage.
- Parse env/config via Zod (`src/core/config.ts`).

### Naming
- Files: kebab-case, often role-suffixed (`accounts.repo.ts`, `threads.adapter.ts`).
- Classes: PascalCase.
- Functions/variables: camelCase.
- Constants: UPPER_SNAKE_CASE.
- Tests: behavior phrasing (`"should ..."`).

### Error handling
- Use typed errors from `src/core/errors.ts` for domain failures.
- Include stable error codes where supported (`new AuthError(message, code)`).
- Do not silently swallow errors.
- Handle expected DB conflicts explicitly (e.g., unique-constraint fallback paths).
- Return `null` for not-found repository lookups instead of throwing.

### Logging
- Use structured logs via `logger`.
- Include context fields (`accountId`, `runId`, `postUrl`, `platform`, etc.).
- Level guide: `debug` (trace), `info` (lifecycle), `warn` (degraded expected), `error` (failure).

### Database and persistence patterns
- Keep Drizzle/SQL access inside `src/db/repositories/`.
- Preserve idempotency where practical (`create` may update on unique collisions).
- Keep timestamps in unix seconds (`Math.floor(Date.now() / 1000)`).

### LLM patterns
- Use `src/llm/openrouter-client.ts` for all LLM calls.
- Define prompt builders in `src/llm/prompts/`.
- Always use Zod schemas for structured output validation.
- Handle markdown code fences in JSON responses (````json...````).
- Use `LLMError` from `src/core/errors.ts` for LLM failures.

### Testing patterns
- Use `bun:test` (`describe`, `it`, `expect`, `beforeAll`, `afterAll`).
- Unit tests in `tests/unit`, integration tests in `tests/integration`.
- Keep assertions deterministic and fixtures local to each test.

## Environment and Safety Notes
- Never commit `.env`.
- Never commit session artifacts under `data/sessions/*`.
- Default DB path: `./data/app.db`.
- Integration tests write to the project database; run carefully.
- Playwright defaults are env-driven (`PLAYWRIGHT_HEADLESS=true` in `.env.example`).

## Feature Flags (in `.env`)
- `TRIAGE_ENABLED` - Enable LLM triage stage
- `DEEP_SCRAPE_ENABLED` - Enable deep scrape for selected posts
- `DRAFTS_ENABLED` - Enable draft generation
- `API_ENABLED` - Enable Express API server
- `SCHEDULER_ENABLED` - Enable cron scheduler

## Roadmap
- [x] Phase 1: Data Model Foundation
- [x] Phase 2: LLM Core (OpenRouter) + Policy Snapshot
- [x] Phase 3: Pipeline Orchestration Stages
- [x] Phase 4: CLI Extensions for Operability
- [x] Phase 5: Express API
- [x] Phase 6: React/Vite + shadcn Dashboard

## Web Dashboard

The web dashboard is a React/Vite + Tailwind v4 application located in `web/`.

### Start the dashboard

```bash
bun run web:dev
```

The dashboard runs on `http://localhost:5173` by default and proxies API requests to the backend at `http://127.0.0.1:3000`.

### Build for production

```bash
bun run web:build
```

### Pages

- **Dashboard** - Overview with health status, run counts, post counts, and active cron jobs
- **Runs** - List of scrape runs with detail drilldown, cascade delete
- **Posts** - Filterable table of scraped posts with platform/author search, external link, delete
- **Drafts** - Review workspace for reply drafts, select/reject with optional feedback
- **Cron Jobs** - Manage scheduled jobs, enable/disable, view run history
- **Policy** - Engagement policy editor per account (topics, goals, avoid list, tone, languages)

### Key Files

- `web/src/App.tsx` - Router and QueryClient setup
- `web/src/components/Layout.tsx` - Navigation layout
- `web/src/components/ui/` - shadcn-style UI components
- `web/src/pages/` - Page components
- `web/src/api/` - API client and types

## Cursor/Copilot Rule Files
Checked locations:
- `.cursorrules`
- `.cursor/rules/`
- `.github/copilot-instructions.md`

No Cursor or Copilot instruction files were found in this repository at the time of writing.

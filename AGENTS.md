# AGENTS.md

Guidance for coding agents working in `engagekit`.

## Purpose

This file defines how agentic coding tools should work in this repository:
- Which commands to run for setup, build, lint, and tests
- How to run a single test quickly
- Code style conventions inferred from the codebase
- Safety rules for environment, data, and generated artifacts
- Whether Cursor/Copilot rule files exist

## Project Snapshot

- Runtime: Bun + TypeScript (ESM)
- CLI entrypoint: `src/cli/index.ts`
- API server: Express (`src/server/index.ts`)
- Database: SQLite + Drizzle ORM
- Scraping: Playwright
- LLM: OpenRouter via OpenAI SDK
- Validation/config: Zod + dotenv
- Logging: Pino
- Frontend: React + Vite + Tailwind (`web/`)

## Key Paths

- `src/cli/` - CLI command wiring
- `src/core/` - config, logger, errors, retry, utils
- `src/db/` - schema, db client, migrations
- `src/db/repositories/` - persistence layer
- `src/domain/` - domain models and Zod schemas
- `src/llm/` - OpenRouter client and prompt builders
- `src/orchestration/` - pipeline and stage orchestration
- `src/platforms/` - Threads/X adapters
- `src/services/` - domain services
- `src/server/` - API server and routes
- `tests/unit/` - unit tests
- `tests/integration/` - integration tests
- `web/` - dashboard app
- `data/` - local runtime artifacts (mostly gitignored)

## Setup Commands

Run from repository root:

```bash
bun install
bunx playwright install chromium
cp .env.example .env
bun run db:migrate
```

## Build / Lint / Test Commands

### Backend / core project (root)

There is no dedicated backend build or lint script at root.

- Type check:
```bash
bun run typecheck
```

- Run all tests:
```bash
bun test
```

- Recommended quality gate for most changes:
```bash
bun run typecheck && bun test
```

### Frontend (`web/`)

- Dev server:
```bash
bun run web:dev
```

- Production build:
```bash
bun run web:build
```

- Lint:
```bash
cd web && bun run lint
```

## Single-Test Workflows (important)

Use these for fast feedback:

- Run one test file:
```bash
bun test tests/unit/hash.test.ts
```

- Run tests by name pattern:
```bash
bun test -t "should produce consistent hashes"
```

- Run by filename token:
```bash
bun test hash
```

- Coverage:
```bash
bun test --coverage
```

Notes:
- `bun test` discovers both `tests/unit` and `tests/integration`.
- Integration tests may write to local DB data; run intentionally.

## Common Runtime Commands

- CLI help:
```bash
bun run cli --help
```

- API server (watch mode):
```bash
bun run api
```

- CLI dev/watch:
```bash
bun run dev
```

- DB tools:
```bash
bun run db:generate
bun run db:migrate
bun run db:push
bun run db:studio
```

## Code Style Guidelines

These are inferred from current source and config.

### Language and modules

- Use TypeScript for source code.
- ESM only (`"type": "module"`).
- Prefer named exports.
- Use default export only when required by framework/tooling contracts.
- Keep modules focused and colocated by feature/domain.

### Formatting

- Use 2-space indentation.
- Prefer semicolons in backend/core (`src/`, `tests/`).
- Prefer double quotes in backend/core.
- Keep trailing commas in multiline arrays/objects/calls.
- Wrap long chains/arguments for readability.
- Preserve existing style in touched files; avoid style churn.

### Imports

- Group imports: external first, then internal.
- Use `import type` for type-only imports.
- Root project commonly uses relative imports (`./`, `../`).
- Web app may use alias imports (`@/...`) as configured.
- Remove unused imports.

### Types and modeling

- Root TypeScript config is strict (`strict: true`).
- Prefer explicit return types on exported functions where useful.
- Reuse domain and schema types from:
  - `src/domain/models.ts`
  - `src/db/schema.ts`
- Prefer narrow unions over broad `string`.
- Avoid new `any`; use `unknown` + narrowing.
- Parse/validate env and external input with Zod.

### Naming

- Files: kebab-case, often role-suffixed (`*.repo.ts`, `*.adapter.ts`).
- Classes: PascalCase.
- Functions/variables: camelCase.
- Constants: UPPER_SNAKE_CASE.
- Tests: behavior style (`"should ..."`).

### Error handling

- Use typed domain errors from `src/core/errors.ts` where appropriate.
- Include stable machine-readable error codes when supported.
- Do not silently swallow exceptions.
- Handle expected DB conflict paths explicitly.
- Repository lookups should return `null` for not-found, not throw.

### Logging

- Use structured logging via `logger` (`src/core/logger.ts`).
- Include contextual fields (`accountId`, `runId`, `platform`, etc.).
- Level guide:
  - `debug`: detailed diagnostics
  - `info`: lifecycle/progress
  - `warn`: recoverable degradation
  - `error`: failed operations

### Database and persistence

- Keep SQL/Drizzle access in repositories under `src/db/repositories/`.
- Preserve idempotent behavior where practical.
- Use unix-second timestamps (`Math.floor(Date.now() / 1000)`).

### LLM integration

- Route LLM calls through `src/llm/openrouter-client.ts`.
- Keep prompt builders in `src/llm/prompts/`.
- Validate structured outputs with Zod.
- Handle markdown-fenced JSON responses safely.
- Use `LLMError` for LLM-specific failures.

## Testing Guidelines

- Use `bun:test` primitives (`describe`, `it`, `expect`, hooks).
- Keep unit tests deterministic and local in fixture setup.
- Prefer targeted tests first, then full suite before handoff.
- For risky/integration changes, run:
```bash
bun run typecheck && bun test
```

## Environment and Safety

- Never commit `.env`.
- Never commit session artifacts in `data/sessions/*`.
- Default DB path: `./data/app.db`.
- Playwright headless behavior is env-driven (`.env.example`).
- Be careful with integration tests that mutate data.

## Cursor / Copilot Rule Files

Checked locations:
- `.cursorrules`
- `.cursor/rules/`
- `.github/copilot-instructions.md`

Current status:
- No Cursor or Copilot instruction files were found.

## Agent Workflow Recommendation

For most code edits:
1. Implement minimal focused changes
2. Run targeted tests for touched areas
3. Run `bun run typecheck && bun test` before handoff
4. Include command outputs and any known risks in handoff notes

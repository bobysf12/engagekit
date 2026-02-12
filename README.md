# Multi-account Engagement Copilot for X/Threads

A human-in-the-loop scraper for X and Threads that collects posts, replies, and metrics. Designed for safe manual engagement with no auto-posting.

## Features

- **Multi-account support**: Manage multiple Threads and X accounts
- **One-time headful login**: Use Playwright storageState for persistent sessions
- **Daily headless scraping**: Collect from notifications, own threads, and optional searches
- **Content deduplication**: SHA256-based content hashing to avoid duplicates
- **Comprehensive data collection**: Posts, comments, metric snapshots, raw JSON snapshots
- **Safe human-in-the-loop**: Engagement queue and LLM drafts (no auto-posting)
- **SQLite with Drizzle ORM**: Simple, portable database
- **Type-safe**: Full TypeScript implementation

## Tech Stack

- **Runtime**: Bun
- **Database**: SQLite + Drizzle ORM
- **Scraping**: Playwright
- **Validation**: Zod
- **Logging**: Pino

## Setup

1. Install dependencies:
```bash
bun install
```

2. Install Playwright browsers:
```bash
bunx playwright install chromium
```

3. Set up database:
```bash
bun run db:migrate
```

4. Copy environment variables:
```bash
cp .env.example .env
```

## Usage

### Account Management

Add a new account:
```bash
bun run cli accounts:add --platform threads --handle yourhandle --name "Your Name"
```

List accounts:
```bash
bun run cli accounts:list
```

Update account status:
```bash
bun run cli accounts:update-status --id 1 --status active
```

### Authentication

Perform headful login (required once per account):
```bash
bun run cli auth:login --account 1
```

Check session validity:
```bash
bun run cli auth:check --account 1
```

### Scraping

Scrape all active accounts for a platform:
```bash
bun run cli scrape:daily --platform threads
```

Scrape a specific account:
```bash
bun run cli scrape:account --account 1
```

With custom options:
```bash
bun run cli scrape:daily --platform threads --no-notifications --search "keyword1 keyword2"
```

### Viewing Results

List recent scrape runs:
```bash
bun run cli runs:list
```

List engagement queue:
```bash
bun run cli queue:list --status pending
```

## Architecture

```
src/
├── cli/                    # CLI commands
├── core/                   # Utilities (config, logger, hash, retry, etc.)
├── db/                     # Database (Drizzle schema, repositories)
├── domain/                 # Domain models and types
├── platforms/              # Platform adapters (threads, x)
├── orchestration/          # Scrape coordinator and runner
└── services/               # Business services
```

### Platform Adapters

The `PlatformAdapter` interface defines the contract for each platform:
- `validateSession()`: Check if session is valid
- `collectNotifications()`: Scrape notifications
- `collectOwnThreads()`: Scrape own posts
- `collectSearch()`: Search for content
- `expandThreadComments()`: Get comments for a post
- `extractMetrics()`: Get engagement metrics

## Session Lifecycle

1. **Initial setup**: `needs_initial_auth` → `auth:login` → `active`
2. **Expired session**: `active` → `needs_reauth` (detected during scrape)
3. **Re-auth**: `needs_reauth` → `auth:login` → `active`

If session is invalid during a headless scrape, the account is marked `needs_reauth` and skipped.

## Database Schema

- `accounts`: Account configurations and auth status
- `scrape_runs`: Global scrape run tracking
- `scrape_run_accounts`: Per-account run results
- `posts`: Collected posts with content hash deduplication
- `comments`: Collected comments
- `metric_snapshots`: Engagement metrics over time
- `raw_snapshots`: Full JSON payloads for debugging
- `engagement_queue`: Human review queue
- `llm_drafts`: Drafted reply suggestions

## Development

Run tests:
```bash
bun test
```

Typecheck:
```bash
bun run typecheck
```

## License

MIT

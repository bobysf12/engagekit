import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    displayName: text("display_name").notNull(),
    handle: text("handle").notNull(),
    status: text("status", {
      enum: ["active", "needs_initial_auth", "needs_reauth", "disabled"],
    }).notNull().default("needs_initial_auth"),
    sessionStatePath: text("session_state_path").notNull(),
    lastAuthAt: integer("last_auth_at"),
    lastAuthCheckAt: integer("last_auth_check_at"),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: integer("last_error_at"),
    lastErrorDetail: text("last_error_detail"),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(30),
    searchQueriesJson: text("search_queries_json"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    platformHandleIdx: uniqueIndex("accounts_platform_handle_idx").on(table.platform, table.handle),
    platformStatusIdx: index("accounts_platform_status_idx").on(table.platform, table.status),
  })
);

export const scrapeRuns = sqliteTable("scrape_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trigger: text("trigger", { enum: ["daily", "manual"] }).notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  status: text("status", { enum: ["running", "success", "partial", "failed"] }).notNull().default("running"),
  notes: text("notes"),
});

export const scrapeRunAccounts = sqliteTable(
  "scrape_run_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id").notNull().references(() => scrapeRuns.id),
    accountId: integer("account_id").notNull().references(() => accounts.id),
    status: text("status", {
      enum: ["running", "success", "skipped_needs_reauth", "failed"],
    }).notNull().default("running"),
    postsFound: integer("posts_found").notNull().default(0),
    commentsFound: integer("comments_found").notNull().default(0),
    snapshotsWritten: integer("snapshots_written").notNull().default(0),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
  },
  (table) => ({
    runAccountIdx: uniqueIndex("scrape_run_accounts_run_account_idx").on(table.runId, table.accountId),
    accountStartedIdx: index("scrape_run_accounts_account_started_idx").on(table.accountId, sql`started_at DESC`),
  })
);

export const posts = sqliteTable(
  "posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    platformPostId: text("platform_post_id"),
    authorHandle: text("author_handle").notNull(),
    authorDisplayName: text("author_display_name").notNull(),
    bodyText: text("body_text"),
    contentHash: text("content_hash").notNull(),
    contentHashAlg: text("content_hash_alg").notNull().default("sha256:v1"),
    postUrl: text("post_url"),
    threadRootPlatformPostId: text("thread_root_platform_post_id"),
    publishedAt: integer("published_at"),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    sourceAccountId: integer("source_account_id").references(() => accounts.id),
  },
  (table) => ({
    platformPostIdIdx: uniqueIndex("posts_platform_post_id_idx").on(
      table.platform,
      table.platformPostId
    ),
    publishedAtIdx: index("posts_published_at_idx").on(table.platform, sql`published_at DESC`),
    contentHashIdx: index("posts_content_hash_idx").on(table.contentHash),
    sourceIdx: index("posts_source_idx").on(table.sourceAccountId, sql`last_seen_at DESC`),
  })
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform").notNull(),
    platformCommentId: text("platform_comment_id"),
    parentPostId: integer("parent_post_id").notNull().references(() => posts.id),
    authorHandle: text("author_handle").notNull(),
    authorDisplayName: text("author_display_name").notNull(),
    bodyText: text("body_text"),
    contentHash: text("content_hash").notNull(),
    contentHashAlg: text("content_hash_alg").notNull().default("sha256:v1"),
    commentUrl: text("comment_url"),
    publishedAt: integer("published_at"),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    sourceAccountId: integer("source_account_id").references(() => accounts.id),
  },
  (table) => ({
    platformCommentIdIdx: uniqueIndex("comments_platform_comment_id_idx").on(
      table.platform,
      table.platformCommentId
    ),
    parentPostIdIdx: index("comments_parent_post_id_idx").on(table.parentPostId),
    publishedAtIdx: index("comments_published_at_idx").on(table.platform, sql`published_at DESC`),
    contentHashIdx: index("comments_content_hash_idx").on(table.contentHash),
  })
);

export const metricSnapshots = sqliteTable(
  "metric_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type", { enum: ["post", "comment"] }).notNull(),
    entityId: integer("entity_id").notNull(),
    likesCount: integer("likes_count"),
    repliesCount: integer("replies_count"),
    repostsCount: integer("reposts_count"),
    viewsCount: integer("views_count"),
    capturedAt: integer("captured_at").notNull(),
    runAccountId: integer("run_account_id").notNull().references(() => scrapeRunAccounts.id),
  },
  (table) => ({
    entityCapturedRunIdx: uniqueIndex("metric_snapshots_entity_captured_run_idx").on(
      table.entityType,
      table.entityId,
      table.capturedAt,
      table.runAccountId
    ),
    entityCapturedIdx: index("metric_snapshots_entity_captured_idx").on(
      table.entityType,
      table.entityId,
      sql`captured_at DESC`
    ),
  })
);

export const rawSnapshots = sqliteTable(
  "raw_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type", { enum: ["post", "comment", "thread", "notification"] }).notNull(),
    entityRef: text("entity_ref").notNull(),
    platform: text("platform").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    capturedAt: integer("captured_at").notNull(),
    runAccountId: integer("run_account_id").notNull().references(() => scrapeRunAccounts.id),
  },
  (table) => ({
    platformEntitySnapshotHashIdx: uniqueIndex("raw_snapshots_platform_entity_snapshot_hash_idx").on(
      table.platform,
      table.entityType,
      table.entityRef,
      table.snapshotHash
    ),
  })
);

export const engagementQueue = sqliteTable(
  "engagement_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type", { enum: ["post", "comment"] }).notNull(),
    entityId: integer("entity_id").notNull(),
    reason: text("reason").notNull(),
    priority: integer("priority").notNull().default(0),
    status: text("status", { enum: ["pending", "in_review", "done", "dismissed"] }).notNull().default("pending"),
    assignedTo: text("assigned_to"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    statusPriorityIdx: index("engagement_queue_status_priority_idx").on(
      table.status,
      sql`priority DESC`,
      table.createdAt
    ),
    entityIdx: index("engagement_queue_entity_idx").on(table.entityType, table.entityId),
  })
);

export const llmDrafts = sqliteTable(
  "llm_drafts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    queueId: integer("queue_id").notNull().references(() => engagementQueue.id),
    promptVersion: text("prompt_version").notNull(),
    draftText: text("draft_text").notNull(),
    model: text("model"),
    status: text("status", { enum: ["generated", "approved", "rejected"] }).notNull().default("generated"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
    reviewedAt: integer("reviewed_at"),
  },
  (table) => ({
    queueCreatedIdx: index("llm_drafts_queue_created_idx").on(table.queueId, sql`created_at DESC`),
  })
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;
export type NewScrapeRun = typeof scrapeRuns.$inferInsert;
export type ScrapeRunAccount = typeof scrapeRunAccounts.$inferSelect;
export type NewScrapeRunAccount = typeof scrapeRunAccounts.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type MetricSnapshot = typeof metricSnapshots.$inferSelect;
export type NewMetricSnapshot = typeof metricSnapshots.$inferInsert;
export type RawSnapshot = typeof rawSnapshots.$inferSelect;
export type NewRawSnapshot = typeof rawSnapshots.$inferInsert;
export type EngagementQueue = typeof engagementQueue.$inferSelect;
export type NewEngagementQueue = typeof engagementQueue.$inferInsert;
export type LlmDraft = typeof llmDrafts.$inferSelect;
export type NewLlmDraft = typeof llmDrafts.$inferInsert;

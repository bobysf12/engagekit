CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`display_name` text NOT NULL,
	`handle` text NOT NULL,
	`status` text DEFAULT 'needs_initial_auth' NOT NULL,
	`session_state_path` text NOT NULL,
	`last_auth_at` integer,
	`last_auth_check_at` integer,
	`last_error_code` text,
	`last_error_at` integer,
	`last_error_detail` text,
	`cooldown_seconds` integer DEFAULT 30 NOT NULL,
	`search_queries_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_platform_handle_idx` ON `accounts` (`platform`,`handle`);--> statement-breakpoint
CREATE INDEX `accounts_platform_status_idx` ON `accounts` (`platform`,`status`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`platform_comment_id` text,
	`parent_post_id` integer NOT NULL,
	`author_handle` text NOT NULL,
	`author_display_name` text NOT NULL,
	`body_text` text,
	`content_hash` text NOT NULL,
	`content_hash_alg` text DEFAULT 'sha256:v1' NOT NULL,
	`comment_url` text,
	`published_at` integer,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`source_account_id` integer,
	FOREIGN KEY (`parent_post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comments_platform_comment_id_idx` ON `comments` (`platform`,`platform_comment_id`);--> statement-breakpoint
CREATE INDEX `comments_parent_post_id_idx` ON `comments` (`parent_post_id`);--> statement-breakpoint
CREATE INDEX `comments_published_at_idx` ON `comments` (`platform`,published_at DESC);--> statement-breakpoint
CREATE INDEX `comments_content_hash_idx` ON `comments` (`content_hash`);--> statement-breakpoint
CREATE TABLE `engagement_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`reason` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`assigned_to` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `engagement_queue_status_priority_idx` ON `engagement_queue` (`status`,priority DESC,`created_at`);--> statement-breakpoint
CREATE INDEX `engagement_queue_entity_idx` ON `engagement_queue` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `llm_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`queue_id` integer NOT NULL,
	`prompt_version` text NOT NULL,
	`draft_text` text NOT NULL,
	`model` text,
	`status` text DEFAULT 'generated' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`queue_id`) REFERENCES `engagement_queue`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `llm_drafts_queue_created_idx` ON `llm_drafts` (`queue_id`,created_at DESC);--> statement-breakpoint
CREATE TABLE `metric_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`likes_count` integer,
	`replies_count` integer,
	`reposts_count` integer,
	`views_count` integer,
	`captured_at` integer NOT NULL,
	`run_account_id` integer NOT NULL,
	FOREIGN KEY (`run_account_id`) REFERENCES `scrape_run_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metric_snapshots_entity_captured_run_idx` ON `metric_snapshots` (`entity_type`,`entity_id`,`captured_at`,`run_account_id`);--> statement-breakpoint
CREATE INDEX `metric_snapshots_entity_captured_idx` ON `metric_snapshots` (`entity_type`,`entity_id`,captured_at DESC);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`platform_post_id` text,
	`author_handle` text NOT NULL,
	`author_display_name` text NOT NULL,
	`body_text` text,
	`content_hash` text NOT NULL,
	`content_hash_alg` text DEFAULT 'sha256:v1' NOT NULL,
	`post_url` text,
	`thread_root_platform_post_id` text,
	`published_at` integer,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`source_account_id` integer,
	FOREIGN KEY (`source_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_platform_post_id_idx` ON `posts` (`platform`,`platform_post_id`);--> statement-breakpoint
CREATE INDEX `posts_published_at_idx` ON `posts` (`platform`,published_at DESC);--> statement-breakpoint
CREATE INDEX `posts_content_hash_idx` ON `posts` (`content_hash`);--> statement-breakpoint
CREATE INDEX `posts_source_idx` ON `posts` (`source_account_id`,last_seen_at DESC);--> statement-breakpoint
CREATE TABLE `raw_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_ref` text NOT NULL,
	`platform` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`captured_at` integer NOT NULL,
	`run_account_id` integer NOT NULL,
	FOREIGN KEY (`run_account_id`) REFERENCES `scrape_run_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_snapshots_platform_entity_snapshot_hash_idx` ON `raw_snapshots` (`platform`,`entity_type`,`entity_ref`,`snapshot_hash`);--> statement-breakpoint
CREATE TABLE `scrape_run_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`posts_found` integer DEFAULT 0 NOT NULL,
	`comments_found` integer DEFAULT 0 NOT NULL,
	`snapshots_written` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_detail` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `scrape_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scrape_run_accounts_run_account_idx` ON `scrape_run_accounts` (`run_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `scrape_run_accounts_account_started_idx` ON `scrape_run_accounts` (`account_id`,started_at DESC);--> statement-breakpoint
CREATE TABLE `scrape_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`notes` text
);

CREATE TABLE `cron_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`name` text NOT NULL,
	`cron_expr` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`pipeline_config_json` text,
	`last_run_at` integer,
	`next_run_at` integer,
	`last_status` text,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cron_jobs_account_idx` ON `cron_jobs` (`account_id`);--> statement-breakpoint
CREATE INDEX `cron_jobs_enabled_idx` ON `cron_jobs` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `cron_job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cron_job_id` integer NOT NULL,
	`scrape_run_id` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`error` text,
	FOREIGN KEY (`cron_job_id`) REFERENCES `cron_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scrape_run_id`) REFERENCES `scrape_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cron_job_runs_cron_job_idx` ON `cron_job_runs` (`cron_job_id`,started_at DESC);--> statement-breakpoint
CREATE TABLE `deep_scrape_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_account_id` integer NOT NULL,
	`post_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_detail` text,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_account_id`) REFERENCES `scrape_run_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deep_scrape_tasks_run_account_post_idx` ON `deep_scrape_tasks` (`run_account_id`,`post_id`);--> statement-breakpoint
CREATE INDEX `deep_scrape_tasks_status_idx` ON `deep_scrape_tasks` (`run_account_id`,`status`);--> statement-breakpoint
CREATE TABLE `draft_feedback_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_account_id` integer NOT NULL,
	`post_id` integer NOT NULL,
	`selected_draft_id` integer,
	`rejected_draft_ids_json` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_account_id`) REFERENCES `scrape_run_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_draft_id`) REFERENCES `llm_drafts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `draft_feedback_signals_run_account_idx` ON `draft_feedback_signals` (`run_account_id`,created_at DESC);--> statement-breakpoint
CREATE INDEX `draft_feedback_signals_post_idx` ON `draft_feedback_signals` (`post_id`);--> statement-breakpoint
CREATE TABLE `engagement_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`name` text NOT NULL,
	`topics_json` text NOT NULL,
	`goals_json` text NOT NULL,
	`avoid_list_json` text NOT NULL,
	`tone_identity` text NOT NULL,
	`preferred_languages_json` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engagement_policies_account_idx` ON `engagement_policies` (`account_id`);--> statement-breakpoint
CREATE TABLE `engagement_policy_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_account_id` integer NOT NULL,
	`policy_id` integer,
	`policy_snapshot_json` text NOT NULL,
	`prompt_version` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_account_id`) REFERENCES `scrape_run_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`policy_id`) REFERENCES `engagement_policies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engagement_policy_snapshots_run_account_idx` ON `engagement_policy_snapshots` (`run_account_id`);--> statement-breakpoint
CREATE TABLE `post_triage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_account_id` integer NOT NULL,
	`post_id` integer NOT NULL,
	`relevance_score` integer NOT NULL,
	`relevance_label` text NOT NULL,
	`reasons_json` text NOT NULL,
	`action` text NOT NULL,
	`confidence` integer NOT NULL,
	`model` text,
	`prompt_version` text,
	`rank` integer,
	`is_top_20` integer DEFAULT 0 NOT NULL,
	`selected_for_deep_scrape` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_account_id`) REFERENCES `scrape_run_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_triage_run_account_post_idx` ON `post_triage` (`run_account_id`,`post_id`);--> statement-breakpoint
CREATE INDEX `post_triage_selection_idx` ON `post_triage` (`run_account_id`,`selected_for_deep_scrape`,relevance_score DESC);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_llm_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`queue_id` integer,
	`prompt_version` text NOT NULL,
	`draft_text` text NOT NULL,
	`model` text,
	`status` text DEFAULT 'generated' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reviewed_at` integer,
	`run_account_id` integer,
	`post_id` integer,
	`option_index` integer,
	`input_context_json` text,
	`selected_at` integer,
	`selected_by` text,
	FOREIGN KEY (`queue_id`) REFERENCES `engagement_queue`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_account_id`) REFERENCES `scrape_run_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_llm_drafts`("id", "queue_id", "prompt_version", "draft_text", "model", "status", "created_at", "reviewed_at", "run_account_id", "post_id", "option_index", "input_context_json", "selected_at", "selected_by") SELECT "id", "queue_id", "prompt_version", "draft_text", "model", "status", "created_at", "reviewed_at", NULL, NULL, NULL, NULL, NULL, NULL FROM `llm_drafts`;--> statement-breakpoint
DROP TABLE `llm_drafts`;--> statement-breakpoint
ALTER TABLE `__new_llm_drafts` RENAME TO `llm_drafts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `llm_drafts_queue_created_idx`;--> statement-breakpoint
CREATE INDEX `llm_drafts_queue_created_idx` ON `llm_drafts` (`queue_id`,`created_at DESC`);--> statement-breakpoint
CREATE INDEX `llm_drafts_run_account_post_idx` ON `llm_drafts` (`run_account_id`,`post_id`,`created_at DESC`);
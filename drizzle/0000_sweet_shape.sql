CREATE TABLE `detections` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`run_id` text,
	`detector_id` text NOT NULL,
	`model` text,
	`is_listing` integer NOT NULL,
	`is_australia` integer NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`listing_type` text,
	`suburb` text,
	`state` text,
	`price_text` text,
	`agency` text,
	`cost_usd` real,
	`via_fallback` integer DEFAULT false NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `detections_post_idx` ON `detections` (`post_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `detections_verified_idx` ON `detections` (`is_listing`,`is_australia`);--> statement-breakpoint
CREATE INDEX `detections_run_idx` ON `detections` (`run_id`);--> statement-breakpoint
CREATE TABLE `keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text DEFAULT 'instagram' NOT NULL,
	`kind` text NOT NULL,
	`term` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keywords_platform_kind_term_idx` ON `keywords` (`platform`,`kind`,`term`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`platform_post_id` text NOT NULL,
	`url` text NOT NULL,
	`author_handle` text,
	`author_name` text,
	`text` text DEFAULT '' NOT NULL,
	`posted_at` text,
	`media_type` text DEFAULT 'unknown' NOT NULL,
	`thumbnail_url` text,
	`thumbnail_path` text,
	`like_count` integer,
	`comment_count` integer,
	`hashtags` text DEFAULT '[]' NOT NULL,
	`mentions` text DEFAULT '[]' NOT NULL,
	`location_name` text,
	`raw` text,
	`collector_id` text NOT NULL,
	`first_seen_run_id` text,
	`collected_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`latest_detection_id` text,
	FOREIGN KEY (`first_seen_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_platform_post_idx` ON `posts` (`platform`,`platform_post_id`);--> statement-breakpoint
CREATE INDEX `posts_posted_at_idx` ON `posts` (`posted_at`);--> statement-breakpoint
CREATE INDEX `posts_latest_detection_idx` ON `posts` (`latest_detection_id`);--> statement-breakpoint
CREATE TABLE `run_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`phase` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_events_run_id_idx` ON `run_events` (`run_id`,`id`);--> statement-breakpoint
CREATE TABLE `run_posts` (
	`run_id` text NOT NULL,
	`post_id` text NOT NULL,
	`term` text NOT NULL,
	`strategy` text NOT NULL,
	`is_new` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_posts_pk` ON `run_posts` (`run_id`,`post_id`,`term`);--> statement-breakpoint
CREATE INDEX `run_posts_post_idx` ON `run_posts` (`post_id`);--> statement-breakpoint
CREATE TABLE `run_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`term` text NOT NULL,
	`strategy` text NOT NULL,
	`posts_seen` integer DEFAULT 0 NOT NULL,
	`posts_new` integer DEFAULT 0 NOT NULL,
	`posts_in_range` integer DEFAULT 0 NOT NULL,
	`pages_fetched` integer DEFAULT 0 NOT NULL,
	`termination_reason` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_terms_run_idx` ON `run_terms` (`run_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`collector_id` text NOT NULL,
	`detector_id` text NOT NULL,
	`config` text NOT NULL,
	`since_date` text NOT NULL,
	`until_date` text NOT NULL,
	`posts_seen` integer DEFAULT 0 NOT NULL,
	`posts_new` integer DEFAULT 0 NOT NULL,
	`posts_detected` integer DEFAULT 0 NOT NULL,
	`posts_verified` integer DEFAULT 0 NOT NULL,
	`detector_cost_usd` real DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `runs_status_started_idx` ON `runs` (`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`label` text NOT NULL,
	`session_id` text NOT NULL,
	`cookies` text DEFAULT '{}' NOT NULL,
	`settings_path` text,
	`status` text DEFAULT 'untested' NOT NULL,
	`status_detail` text,
	`last_checked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_platform_status_idx` ON `sessions` (`platform`,`status`);
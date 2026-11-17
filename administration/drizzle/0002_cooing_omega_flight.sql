CREATE TABLE `recommendation_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`issue_key` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recommendation_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`revision` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload` text NOT NULL,
	`actor_id` text NOT NULL,
	`submitted_at` text NOT NULL,
	`synced_at` text,
	`sync_receipt` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `response_issue_revision` ON `recommendation_responses` (`issue_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `response_issue_retry` ON `recommendation_responses` (`issue_id`,`idempotency_key`);
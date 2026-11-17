CREATE TABLE `sheet_sync_lock` (
	`id` text PRIMARY KEY NOT NULL,
	`lease` text NOT NULL,
	`expires_at` integer NOT NULL
);

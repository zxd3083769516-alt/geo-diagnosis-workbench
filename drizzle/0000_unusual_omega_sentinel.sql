CREATE TABLE `geo_workspace_history` (
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `geo_workspaces` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);

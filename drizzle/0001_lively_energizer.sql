CREATE TABLE `geo_records` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`client_id` text NOT NULL,
	`kind` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `geo_records_owner_client_kind` ON `geo_records` (`owner_id`,`client_id`,`kind`);
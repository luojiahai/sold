ALTER TABLE `detections` ADD `address_text` text;--> statement-breakpoint
ALTER TABLE `detections` ADD `unit` text;--> statement-breakpoint
ALTER TABLE `detections` ADD `street_number` text;--> statement-breakpoint
ALTER TABLE `detections` ADD `street` text;--> statement-breakpoint
ALTER TABLE `detections` ADD `postcode` text;--> statement-breakpoint
ALTER TABLE `detections` ADD `property_count` integer;--> statement-breakpoint
ALTER TABLE `detections` ADD `price_min` integer;--> statement-breakpoint
ALTER TABLE `detections` ADD `price_max` integer;--> statement-breakpoint
ALTER TABLE `detections` ADD `price_period` text;--> statement-breakpoint
ALTER TABLE `detections` ADD `price_currency` text;--> statement-breakpoint
ALTER TABLE `detections` ADD `price_qualifier` text;--> statement-breakpoint
ALTER TABLE `detections` ADD `prompt_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `detections_prompt_version_idx` ON `detections` (`prompt_version`);--> statement-breakpoint
ALTER TABLE `runs` ADD `kind` text DEFAULT 'harvest' NOT NULL;
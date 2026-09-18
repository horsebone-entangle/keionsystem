CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `band_members` (
	`band_id` text NOT NULL,
	`student_id` text NOT NULL,
	PRIMARY KEY(`band_id`, `student_id`),
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `members`(`student_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_band_name` ON `bands` (`name`) WHERE "bands"."status" = 'active';--> statement-breakpoint
CREATE TABLE `room_days` (
	`date` text PRIMARY KEY NOT NULL,
	`is_open` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`student_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`password_hash` text,
	`invitation_hash` text,
	`created_at` text NOT NULL,
	CONSTRAINT "member_role" CHECK("members"."role" IN ('member','admin'))
);
--> statement-breakpoint
CREATE TABLE `band_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`request_type` text NOT NULL,
	`band_name` text NOT NULL,
	`band_id` text,
	`student_id` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`member_entries` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `members`(`student_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `members`(`student_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "request_type" CHECK("band_requests"."request_type" IN ('create','update_members','dissolve')),
	CONSTRAINT "request_status" CHECK("band_requests"."status" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE INDEX `requests_status` ON `band_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`slot_id` text NOT NULL,
	`reservation_type` text NOT NULL,
	`student_id` text NOT NULL,
	`band_id` text,
	`created_at` text NOT NULL,
	`cancelled_at` text,
	FOREIGN KEY (`student_id`) REFERENCES `members`(`student_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reservation_type" CHECK(("reservations"."reservation_type"='band' AND "reservations"."band_id" IS NOT NULL) OR ("reservations"."reservation_type"='personal' AND "reservations"."band_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_per_slot` ON `reservations` (`date`,`slot_id`) WHERE "reservations"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX `reservation_person_month` ON `reservations` (`student_id`,`date`);--> statement-breakpoint
CREATE INDEX `reservation_band_month` ON `reservations` (`band_id`,`date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `members`(`student_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_member` ON `sessions` (`student_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`personal_open_days` integer NOT NULL,
	`monthly_band_limit` integer NOT NULL,
	`monthly_personal_limit` integer NOT NULL,
	`weekly_open_slots` text NOT NULL,
	CONSTRAINT "settings_singleton" CHECK("settings"."id"=1)
);
--> statement-breakpoint
CREATE TABLE `room_slots` (
	`date` text NOT NULL,
	`slot_id` text NOT NULL,
	`is_open` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`date`, `slot_id`)
);

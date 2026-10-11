CREATE INDEX "fia_documents_unnotified_idx" ON "fia_documents" USING btree ("first_seen_at") WHERE "fia_documents"."notified_at" is null;--> statement-breakpoint
CREATE INDEX "schedule_changes_unnotified_idx" ON "schedule_changes" USING btree ("id") WHERE "schedule_changes"."notified_at" is null;--> statement-breakpoint
CREATE INDEX "sessions_starts_at_idx" ON "sessions" USING btree ("starts_at");
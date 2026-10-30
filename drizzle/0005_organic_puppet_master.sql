DROP INDEX "user_rate_limit_window_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "user_rate_limit_scope_unique" ON "userRateLimit" USING btree ("userId","scope");
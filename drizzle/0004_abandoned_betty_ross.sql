CREATE TABLE "securityEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"eventType" text NOT NULL,
	"agentId" text,
	"userId" text,
	"severity" text NOT NULL,
	"detectionResult" text NOT NULL,
	"actionTaken" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userRateLimit" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"scope" text NOT NULL,
	"windowStart" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "security_event_user_time_idx" ON "securityEvent" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "security_event_agent_time_idx" ON "securityEvent" USING btree ("agentId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "user_rate_limit_window_unique" ON "userRateLimit" USING btree ("userId","scope","windowStart");
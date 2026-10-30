CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"systemInstructions" text NOT NULL,
	"firstMessage" text NOT NULL,
	"voiceId" text DEFAULT '' NOT NULL,
	"voiceConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"language" text DEFAULT 'English' NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"workflow" jsonb DEFAULT '{"nodes":[],"edges":[]}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"elevenLabsAgentId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"lastDeployedAt" timestamp with time zone,
	CONSTRAINT "agent_elevenLabsAgentId_unique" UNIQUE("elevenLabsAgentId")
);
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_user_id_idx" ON "agent" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "agent_status_idx" ON "agent" USING btree ("userId","status");
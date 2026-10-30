CREATE TABLE "callSummary" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"conversationId" text NOT NULL,
	"agentId" text,
	"title" text NOT NULL,
	"executiveSummary" text NOT NULL,
	"customerIntent" text NOT NULL,
	"keyDiscussionPoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customerRequirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"callOutcome" text NOT NULL,
	"importantCommitments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"followUpTasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unresolvedIssues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extractedEntities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"groqModel" text NOT NULL,
	"rawModelOutput" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "callSummary" ADD CONSTRAINT "callSummary_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callSummary" ADD CONSTRAINT "callSummary_conversationId_conversationRecord_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversationRecord"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callSummary" ADD CONSTRAINT "callSummary_agentId_agent_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_summary_conv_idx" ON "callSummary" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "call_summary_user_id_idx" ON "callSummary" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "call_summary_agent_id_idx" ON "callSummary" USING btree ("agentId");
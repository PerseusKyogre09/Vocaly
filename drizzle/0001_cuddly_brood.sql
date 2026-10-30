CREATE TABLE "agentRecord" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"elevenLabsAgentId" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "agentRecord_elevenLabsAgentId_unique" UNIQUE("elevenLabsAgentId")
);
--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "agentRecord" ADD CONSTRAINT "agentRecord_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
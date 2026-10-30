CREATE TABLE "phoneCall" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"agentId" text NOT NULL,
	"exotelCallSid" text,
	"destination" text NOT NULL,
	"status" text DEFAULT 'initiating' NOT NULL,
	"providerMetadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	CONSTRAINT "phoneCall_exotelCallSid_unique" UNIQUE("exotelCallSid")
);
--> statement-breakpoint
ALTER TABLE "phoneCall" ADD CONSTRAINT "phoneCall_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phoneCall" ADD CONSTRAINT "phoneCall_agentId_agent_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phone_call_user_id_idx" ON "phoneCall" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "phone_call_agent_id_idx" ON "phoneCall" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX "phone_call_status_idx" ON "phoneCall" USING btree ("status");
CREATE TABLE "actionDefinition" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"agentId" text,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"actionType" text DEFAULT 'webhook' NOT NULL,
	"requiresApproval" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"triggerConditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"webhookConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actionExecution" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"actionInstanceId" text NOT NULL,
	"attemptNumber" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"requestUrl" text,
	"requestMethod" text,
	"requestHeadersRedacted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requestPayloadRedacted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"responseStatus" integer,
	"responseBodySnippet" text,
	"errorMessage" text,
	"durationMs" integer DEFAULT 0 NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"completedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actionInstance" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"conversationId" text NOT NULL,
	"actionDefinitionId" text,
	"name" text NOT NULL,
	"actionType" text DEFAULT 'webhook' NOT NULL,
	"status" text DEFAULT 'awaiting_approval' NOT NULL,
	"requiresApproval" boolean DEFAULT true NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotencyKey" text NOT NULL,
	"rejectionReason" text,
	"approvedAt" timestamp with time zone,
	"approvedBy" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actionSchema" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"agentId" text,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversationExtraction" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"conversationId" text NOT NULL,
	"schemaId" text,
	"extractedFields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"intent" text DEFAULT '' NOT NULL,
	"uncertainties" text DEFAULT '' NOT NULL,
	"groqModel" text NOT NULL,
	"rawModelOutput" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversationRecord" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"agentId" text,
	"source" text DEFAULT 'manual_test' NOT NULL,
	"externalConversationId" text,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rawTranscriptText" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actionDefinition" ADD CONSTRAINT "actionDefinition_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actionDefinition" ADD CONSTRAINT "actionDefinition_agentId_agent_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actionExecution" ADD CONSTRAINT "actionExecution_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actionExecution" ADD CONSTRAINT "actionExecution_actionInstanceId_actionInstance_id_fk" FOREIGN KEY ("actionInstanceId") REFERENCES "public"."actionInstance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actionInstance" ADD CONSTRAINT "actionInstance_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actionInstance" ADD CONSTRAINT "actionInstance_conversationId_conversationRecord_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversationRecord"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actionInstance" ADD CONSTRAINT "actionInstance_actionDefinitionId_actionDefinition_id_fk" FOREIGN KEY ("actionDefinitionId") REFERENCES "public"."actionDefinition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actionSchema" ADD CONSTRAINT "actionSchema_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actionSchema" ADD CONSTRAINT "actionSchema_agentId_agent_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversationExtraction" ADD CONSTRAINT "conversationExtraction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversationExtraction" ADD CONSTRAINT "conversationExtraction_conversationId_conversationRecord_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversationRecord"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversationExtraction" ADD CONSTRAINT "conversationExtraction_schemaId_actionSchema_id_fk" FOREIGN KEY ("schemaId") REFERENCES "public"."actionSchema"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversationRecord" ADD CONSTRAINT "conversationRecord_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversationRecord" ADD CONSTRAINT "conversationRecord_agentId_agent_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_definition_user_id_idx" ON "actionDefinition" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "action_definition_agent_id_idx" ON "actionDefinition" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX "action_execution_instance_idx" ON "actionExecution" USING btree ("actionInstanceId");--> statement-breakpoint
CREATE INDEX "action_execution_user_id_idx" ON "actionExecution" USING btree ("userId","startedAt");--> statement-breakpoint
CREATE INDEX "action_instance_user_id_idx" ON "actionInstance" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "action_instance_conv_idx" ON "actionInstance" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "action_instance_status_idx" ON "actionInstance" USING btree ("userId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "action_instance_idempotency_idx" ON "actionInstance" USING btree ("userId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "action_schema_user_id_idx" ON "actionSchema" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "action_schema_agent_id_idx" ON "actionSchema" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX "conv_extraction_conv_idx" ON "conversationExtraction" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "conv_extraction_user_id_idx" ON "conversationExtraction" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "conv_record_user_id_idx" ON "conversationRecord" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "conv_record_agent_id_idx" ON "conversationRecord" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX "conv_record_ext_id_idx" ON "conversationRecord" USING btree ("userId","externalConversationId");
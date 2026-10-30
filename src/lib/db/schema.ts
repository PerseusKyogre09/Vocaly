import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull()
};

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  ...timestamps
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' })
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  ...timestamps
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  ...timestamps
});

export const workspace = pgTable('workspace', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name'),
  agent: jsonb('agent').notNull(),
  flowNodes: jsonb('flowNodes').notNull(),
  flowEdges: jsonb('flowEdges').notNull(),
  lastLabResult: jsonb('lastLabResult'),
  ...timestamps
});

export const agentRecord = pgTable('agentRecord', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  elevenLabsAgentId: text('elevenLabsAgentId').notNull().unique(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull()
});

export const agent = pgTable('agent', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  systemInstructions: text('systemInstructions').notNull(),
  firstMessage: text('firstMessage').notNull(),
  voiceId: text('voiceId').notNull().default(''),
  voiceConfig: jsonb('voiceConfig').notNull().default({}),
  language: text('language').notNull().default('English'),
  configuration: jsonb('configuration').notNull().default({}),
  workflow: jsonb('workflow').notNull().default({ nodes: [], edges: [] }),
  status: text('status').notNull().default('draft'),
  elevenLabsAgentId: text('elevenLabsAgentId').unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
  lastDeployedAt: timestamp('lastDeployedAt', { withTimezone: true })
}, (table) => ({
  userIdIdx: index('agent_user_id_idx').on(table.userId),
  statusIdx: index('agent_status_idx').on(table.userId, table.status)
}));

export const testRun = pgTable('testRun', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  result: jsonb('result').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull()
});

export const phoneCall = pgTable('phoneCall', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  agentId: text('agentId').notNull().references(() => agent.id, { onDelete: 'cascade' }),
  exotelCallSid: text('exotelCallSid').unique(),
  destination: text('destination').notNull(),
  status: text('status').notNull().default('initiating'),
  providerMetadata: jsonb('providerMetadata').notNull().default({}),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
  startedAt: timestamp('startedAt', { withTimezone: true }),
  completedAt: timestamp('completedAt', { withTimezone: true })
}, (table) => ({
  userIdIdx: index('phone_call_user_id_idx').on(table.userId),
  agentIdIdx: index('phone_call_agent_id_idx').on(table.agentId),
  statusIdx: index('phone_call_status_idx').on(table.status)
}));

export const securityEvent = pgTable('securityEvent', {
  id: text('id').primaryKey(),
  eventType: text('eventType').notNull(),
  agentId: text('agentId'),
  userId: text('userId'),
  severity: text('severity').notNull(),
  detectionResult: text('detectionResult').notNull(),
  actionTaken: text('actionTaken').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull()
}, (table) => ({
  userTimeIdx: index('security_event_user_time_idx').on(table.userId, table.createdAt),
  agentTimeIdx: index('security_event_agent_time_idx').on(table.agentId, table.createdAt)
}));

export const userRateLimit = pgTable('userRateLimit', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  scope: text('scope').notNull(),
  windowStart: timestamp('windowStart', { withTimezone: true }).notNull(),
  hits: integer('hits').notNull().default(0)
}, (table) => ({
  userScope: uniqueIndex('user_rate_limit_scope_unique').on(table.userId, table.scope)
}));

export const actionSchema = pgTable('actionSchema', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  agentId: text('agentId').references(() => agent.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  fields: jsonb('fields').notNull().default([]), // Array<{ name: string, type: string, description: string, required: boolean, default?: any }>
  isDefault: boolean('isDefault').notNull().default(false),
  ...timestamps
}, (table) => ({
  userIdIdx: index('action_schema_user_id_idx').on(table.userId),
  agentIdIdx: index('action_schema_agent_id_idx').on(table.agentId)
}));

export const actionDefinition = pgTable('actionDefinition', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  agentId: text('agentId').references(() => agent.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  actionType: text('actionType').notNull().default('webhook'), // 'webhook' | 'internal_record' | 'notification'
  requiresApproval: boolean('requiresApproval').notNull().default(true),
  enabled: boolean('enabled').notNull().default(true),
  triggerConditions: jsonb('triggerConditions').notNull().default({}), // e.g. { allRequiredPresent: true, confidenceThreshold: 0.7 }
  webhookConfig: jsonb('webhookConfig').notNull().default({}), // { url, method, headers, bodyMapping, timeoutMs, retryLimit }
  ...timestamps
}, (table) => ({
  userIdIdx: index('action_definition_user_id_idx').on(table.userId),
  agentIdIdx: index('action_definition_agent_id_idx').on(table.agentId)
}));

export const conversationRecord = pgTable('conversationRecord', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  agentId: text('agentId').references(() => agent.id, { onDelete: 'set null' }),
  source: text('source').notNull().default('manual_test'), // 'manual_test' | 'elevenlabs' | 'phone_call'
  externalConversationId: text('externalConversationId'),
  transcript: jsonb('transcript').notNull().default([]), // Array<{ role: 'user' | 'agent' | 'assistant' | 'system', message: string, time?: string | number }>
  rawTranscriptText: text('rawTranscriptText').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  status: text('status').notNull().default('completed'), // 'completed' | 'processing' | 'extracted' | 'failed'
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull()
}, (table) => ({
  userIdIdx: index('conv_record_user_id_idx').on(table.userId),
  agentIdIdx: index('conv_record_agent_id_idx').on(table.agentId),
  extIdIdx: index('conv_record_ext_id_idx').on(table.userId, table.externalConversationId)
}));

export const conversationExtraction = pgTable('conversationExtraction', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  conversationId: text('conversationId').notNull().references(() => conversationRecord.id, { onDelete: 'cascade' }),
  schemaId: text('schemaId').references(() => actionSchema.id, { onDelete: 'set null' }),
  extractedFields: jsonb('extractedFields').notNull().default([]), // Array<{ name, value, confidence, evidence, isMissing, isAmbiguous, isExplicit }>
  summary: text('summary').notNull().default(''),
  intent: text('intent').notNull().default(''),
  uncertainties: text('uncertainties').notNull().default(''),
  groqModel: text('groqModel').notNull(),
  rawModelOutput: text('rawModelOutput'),
  status: text('status').notNull().default('completed'), // 'completed' | 'failed'
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull()
}, (table) => ({
  convIdx: index('conv_extraction_conv_idx').on(table.conversationId),
  userIdIdx: index('conv_extraction_user_id_idx').on(table.userId)
}));

export const actionInstance = pgTable('actionInstance', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  conversationId: text('conversationId').notNull().references(() => conversationRecord.id, { onDelete: 'cascade' }),
  actionDefinitionId: text('actionDefinitionId').references(() => actionDefinition.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  actionType: text('actionType').notNull().default('webhook'),
  status: text('status').notNull().default('awaiting_approval'), // 'draft' | 'awaiting_approval' | 'approved' | 'running' | 'completed' | 'failed' | 'rejected'
  requiresApproval: boolean('requiresApproval').notNull().default(true),
  payload: jsonb('payload').notNull().default({}), // Resolved payload
  idempotencyKey: text('idempotencyKey').notNull(),
  rejectionReason: text('rejectionReason'),
  approvedAt: timestamp('approvedAt', { withTimezone: true }),
  approvedBy: text('approvedBy'),
  ...timestamps
}, (table) => ({
  userIdIdx: index('action_instance_user_id_idx').on(table.userId),
  convIdx: index('action_instance_conv_idx').on(table.conversationId),
  statusIdx: index('action_instance_status_idx').on(table.userId, table.status),
  idempotencyIdx: uniqueIndex('action_instance_idempotency_idx').on(table.userId, table.idempotencyKey)
}));

export const actionExecution = pgTable('actionExecution', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  actionInstanceId: text('actionInstanceId').notNull().references(() => actionInstance.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attemptNumber').notNull().default(1),
  status: text('status').notNull(), // 'success' | 'failed' | 'timeout'
  requestUrl: text('requestUrl'),
  requestMethod: text('requestMethod'),
  requestHeadersRedacted: jsonb('requestHeadersRedacted').notNull().default({}),
  requestPayloadRedacted: jsonb('requestPayloadRedacted').notNull().default({}),
  responseStatus: integer('responseStatus'),
  responseBodySnippet: text('responseBodySnippet'),
  errorMessage: text('errorMessage'),
  durationMs: integer('durationMs').notNull().default(0),
  startedAt: timestamp('startedAt', { withTimezone: true }).notNull(),
  completedAt: timestamp('completedAt', { withTimezone: true }).notNull()
}, (table) => ({
  instanceIdx: index('action_execution_instance_idx').on(table.actionInstanceId),
  userIdIdx: index('action_execution_user_id_idx').on(table.userId, table.startedAt)
}));

export const dbSchema = {
  user,
  session,
  account,
  verification,
  workspace,
  agentRecord,
  agent,
  testRun,
  phoneCall,
  securityEvent,
  userRateLimit,
  actionSchema,
  actionDefinition,
  conversationRecord,
  conversationExtraction,
  actionInstance,
  actionExecution
};

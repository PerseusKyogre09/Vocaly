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

export const dbSchema = { user, session, account, verification, workspace, agentRecord, agent, testRun, phoneCall, securityEvent, userRateLimit };

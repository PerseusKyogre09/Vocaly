CREATE TABLE IF NOT EXISTS "user" ("id" text PRIMARY KEY NOT NULL, "name" text NOT NULL, "email" text NOT NULL UNIQUE, "emailVerified" boolean DEFAULT false NOT NULL, "image" text, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" ("id" text PRIMARY KEY NOT NULL, "expiresAt" timestamptz NOT NULL, "token" text NOT NULL UNIQUE, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL, "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" ("id" text PRIMARY KEY NOT NULL, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" ("id" text PRIMARY KEY NOT NULL, "identifier" text NOT NULL, "value" text NOT NULL, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace" ("id" text PRIMARY KEY NOT NULL, "userId" text NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE, "agent" jsonb NOT NULL, "flowNodes" jsonb NOT NULL, "flowEdges" jsonb NOT NULL, "lastLabResult" jsonb, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "testRun" ("id" text PRIMARY KEY NOT NULL, "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE, "result" jsonb NOT NULL, "createdAt" timestamptz NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_run_user_id_idx" ON "testRun" ("userId");

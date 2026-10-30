import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { getDatabase } from './db';
import { dbSchema } from './db/schema';

export function getAuth() {
  const secret = import.meta.env.BETTER_AUTH_SECRET;
  const baseURL = import.meta.env.BETTER_AUTH_URL || import.meta.env.PUBLIC_APP_URL;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not configured.');
  if (!baseURL) throw new Error('BETTER_AUTH_URL or PUBLIC_APP_URL is not configured.');

  const socialProviders = {
    ...(import.meta.env.GITHUB_CLIENT_ID && import.meta.env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: import.meta.env.GITHUB_CLIENT_ID, clientSecret: import.meta.env.GITHUB_CLIENT_SECRET } }
      : {}),
    ...(import.meta.env.GOOGLE_CLIENT_ID && import.meta.env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: import.meta.env.GOOGLE_CLIENT_ID, clientSecret: import.meta.env.GOOGLE_CLIENT_SECRET } }
      : {})
  };

  return betterAuth({
    database: drizzleAdapter(getDatabase(), { provider: 'pg', schema: dbSchema, camelCase: true }),
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    emailAndPassword: { enabled: true },
    ...(Object.keys(socialProviders).length > 0 ? { socialProviders } : {})
  });
}

export function authError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Authentication is not configured.';
  return Response.json({ error: message }, { status: 503 });
}

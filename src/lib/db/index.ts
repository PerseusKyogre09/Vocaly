import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { dbSchema } from './schema';

let database: ReturnType<typeof drizzle<typeof dbSchema>> | undefined;

export function getDatabase() {
  const connectionString = import.meta.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured.');
  database ??= drizzle(neon(connectionString), { schema: dbSchema });
  return database;
}

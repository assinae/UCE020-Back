import 'dotenv/config';
import * as schema from './schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

function normalizeDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) return databaseUrl;

  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get('sslmode');

  if (
    sslMode === 'prefer' ||
    sslMode === 'require' ||
    sslMode === 'verify-ca'
  ) {
    url.searchParams.set('sslmode', 'verify-full');
  }

  return url.toString();
}

const pool = new Pool({
  connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
  options: '-c timezone=America/Bahia',
});

export const db = drizzle(pool, { schema });

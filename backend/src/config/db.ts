import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import logger = require('../utils/logger');

function envInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: envInteger(process.env.DB_PORT, 5432),
  database: process.env.DB_NAME || 'vidyasetu_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  min: envInteger(process.env.DB_POOL_MIN, 2),
  max: envInteger(process.env.DB_POOL_MAX, 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err: Error) => {
  logger.error('Unexpected PostgreSQL pool error:', err);
});

interface ServerTimeRow extends QueryResultRow {
  now: Date | string;
}

export async function connectDB(): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<ServerTimeRow>('SELECT NOW() as now');
    logger.info(`PostgreSQL connected — server time: ${rows[0]?.now ?? 'unknown'}`);
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (duration > 500) {
    logger.warn(`Slow query (${duration}ms): ${text.substring(0, 80)}`);
  }
  return result;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

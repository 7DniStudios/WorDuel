import pgPromise from 'pg-promise';

import { logger } from '../logging/logger';

const initOptions = {};
const pgp = pgPromise(initOptions);

const cn = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
};

export const db = pgp(cn);
export { pgp };

export async function bootstrapDB() {
  logger.info("Checking connection to PostgreSQL database...");
  const obj = await db.connect();
  obj.done();
  logger.info('Database available!');

  logger.info('Running test query...');
  interface DatabaseTimeResponse {
    server_time: Date;
  };

  const res = await db.one<DatabaseTimeResponse>('SELECT NOW() as server_time');
  logger.info(`Test query: 'SELECT NOW()' -> "${res.server_time.toISOString()}".`);
}

export const UniqueViolation = '23505';
export interface PgError extends Error {
  code: string;
  constraint?: string;
}
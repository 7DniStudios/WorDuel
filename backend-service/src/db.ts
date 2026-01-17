import pgPromise from 'pg-promise';

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

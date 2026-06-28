import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.database.url });
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;

  await pool.end();
  pool = null;
}

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";

// Return DATE columns as ISO strings (no timezone shifting).
types.setTypeParser(1082, (v: string) => v);
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __ciosPool?: Pool; __ciosDb?: DB };

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  const needsSsl = /sslmode=require|neon\.tech/.test(url);
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    ssl: needsSsl ? true : undefined,
  });
}

export function getPool(): Pool {
  if (!globalForDb.__ciosPool) globalForDb.__ciosPool = createPool();
  return globalForDb.__ciosPool;
}

export function getDb(): DB {
  if (!globalForDb.__ciosDb) globalForDb.__ciosDb = drizzle(getPool(), { schema });
  return globalForDb.__ciosDb;
}

export { schema };

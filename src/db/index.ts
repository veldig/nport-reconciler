import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local, then run `npm run db:local` in another terminal.");
  }
  // The local PGlite server is single-connection under the hood; one client connection avoids contention.
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, { max: isLocal ? 1 : 5, prepare: false, onnotice: () => {} });
}

// Reuse one client across hot reloads in dev.
const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
const client = g.__pg ?? createDb();
if (process.env.NODE_ENV !== "production") g.__pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };

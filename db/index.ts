// Database access with a dual driver:
// - DATABASE_URL set  → real Postgres (production / staging)
// - otherwise         → PGlite, an embedded Postgres persisted to ./.data
//   (local dev and tests run with zero external services)
//
// Migrations in ./drizzle are applied automatically on first connection.

import * as schema from "./schema";

type Db = ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;

declare global {
  var __moietyDb: Promise<Db> | undefined;
}

async function connect(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const client = postgres(process.env.DATABASE_URL, { max: 10 });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    return db as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir =
    process.env.NODE_ENV === "test" ? undefined : "./.data/moiety";
  if (dataDir) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

/** Get the singleton database handle (survives Next.js hot reloads). */
export function getDb(): Promise<Db> {
  if (!globalThis.__moietyDb) globalThis.__moietyDb = connect();
  return globalThis.__moietyDb;
}

export { schema };

import { pool } from "./pool.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";
import { fileURLToPath } from "node:url";

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

export async function reset() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
    if (tables) {
      await client.query(`DROP TABLE IF EXISTS ${tables} CASCADE`);
    }
  } finally {
    client.release();
  }
  await migrate();
  await seed();
}

if (isMain) {
  reset()
    .then(() => {
      console.log("[db] reset + migrate + seed complete");
      process.exit(0);
    })
    .catch((e) => {
      console.error("[db] reset failed", e);
      process.exit(1);
    });
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const rows = JSON.parse(
  readFileSync(path.join(__dirname, "friendships.json"), "utf8"),
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query("BEGIN");
  for (const r of rows) {
    await pool.query(
      `INSERT INTO friendships (id, owner_id, friend_id, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [r.id, r.owner_id, r.friend_id, r.created_at],
    );
  }
  // Advance the serial sequence past the largest imported id so new inserts don't collide.
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('friendships', 'id'), (SELECT MAX(id) FROM friendships))`,
  );
  await pool.query("COMMIT");

  const { rows: countRows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM friendships",
  );
  console.log(`Seeded. friendships row count: ${countRows[0].count}`);
} catch (err) {
  await pool.query("ROLLBACK");
  throw err;
} finally {
  await pool.end();
}

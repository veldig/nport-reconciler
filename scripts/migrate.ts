import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "../src/db";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });

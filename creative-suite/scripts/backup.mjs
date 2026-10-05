import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
if (existsSync(".env")) process.loadEnvFile(".env");
const data = resolve(process.env.DLS_DATA_DIR || "data"),
  destination = resolve(
    process.argv[2] ||
      join("backups", new Date().toISOString().replace(/[:.]/g, "-")),
  );
if (!existsSync(join(data, "dls.sqlite")))
  throw new Error("No workspace database to back up.");
mkdirSync(destination, { recursive: true });
if (existsSync(join(destination, "dls.sqlite")))
  throw new Error(
    "Destination already contains a database. Choose a new backup folder.",
  );
const db = new DatabaseSync(join(data, "dls.sqlite"), { readOnly: true });
try {
  await backup(db, join(destination, "dls.sqlite"));
  writeFileSync(
    join(destination, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        created: new Date().toISOString(),
        contains: [
          "scores",
          "revisions",
          "accounts",
          "practice",
          "artifacts",
          "action-receipts",
        ],
        excludes: [
          "environment-secrets",
          "REAPER-projects",
          "bridge-spool",
          "uploaded-audio-bytes",
        ],
      },
      null,
      2,
    ),
  );
  console.log(`Backup saved: ${destination}`);
} finally {
  db.close();
}

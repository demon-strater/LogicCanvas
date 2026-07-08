import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not set; skipping database migration.");
  process.exit(0);
}

const result = spawnSync(
  "npx",
  ["drizzle-kit", "push", "--config", "drizzle.config.ts"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);

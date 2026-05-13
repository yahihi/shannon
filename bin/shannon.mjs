#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "index.ts");

const result = spawnSync("bun", [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error(
      "shannon requires Bun (https://bun.sh). Install it and try again.",
    );
    process.exit(127);
  }
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);

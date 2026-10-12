import { spawnSync } from "node:child_process";

// Nub forwards a literal `--` to Vitest, where it can hide every file filter.
// Guard only argument forwarding; selection and execution remain Vitest's job.
const [mode, ...filters] = process.argv.slice(2);
if (
  !["run", "related", "watch"].includes(mode ?? "") ||
  !filters[0] ||
  filters[0].startsWith("-") ||
  filters.includes("--")
) {
  console.error(
    "Scoped tests require a file/filter directly after the script name, without a literal --. Example: nub run test:scope tests/boundary/project-access.test.ts. Use test:e2e for native journeys.",
  );
  process.exit(1);
}

const result = spawnSync(
  "nubx",
  ["vitest", mode, ...(mode === "related" ? ["--run"] : []), ...filters],
  { stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);

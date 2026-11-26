import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "../../vitest.config.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

// The shared boundary suite anchors workspace paths at the process cwd
// (resolve("packages/agent/..."), repoRoot: process.cwd()). Vitest workers
// inherit the invocation cwd rather than the configured root, so running
// this config from the desktop workspace — as desktop:test does — would
// resolve those paths beneath apps/desktop. Anchor the cwd at the repo
// root before workers spawn, matching the suite's contract.
process.chdir(repoRoot);

export default defineConfig({
  ...base,
  root: repoRoot,
});

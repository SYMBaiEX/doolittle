#!/usr/bin/env nub

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(root, process.env.CARGO_TARGET_DIR || "target");
const extension = process.platform === "win32" ? ".exe" : "";
const binary = resolve(target, "release", `doolittle-native${extension}`);

if (
  !existsSync(binary) ||
  !existsSync(resolve(root, "apps/cli/dist/index.js"))
) {
  process.stderr.write(
    "Build Doolittle first with `nub run native:build`, or run the source installer.\n",
  );
  process.exitCode = 1;
} else {
  const child = spawn(
    binary,
    process.argv.slice(process.argv[2] === "--" ? 3 : 2),
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DOOLITTLE_RUNTIME_ROOT: process.env.DOOLITTLE_RUNTIME_ROOT ?? root,
      },
    },
  );
  // Terminal process groups already deliver interrupt/suspend signals to both
  // programs. Keep the launcher alive to relay the client's result.
  const ignoreInterrupt = () => {};
  process.on("SIGINT", ignoreInterrupt);
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.once("error", () => {
    process.stderr.write("Could not launch the Doolittle native client.\n");
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode =
      code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
  });
}

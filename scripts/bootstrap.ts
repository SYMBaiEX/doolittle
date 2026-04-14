#!/usr/bin/env bun

import { runBootstrapProgram } from "./bootstrap/program";

export { runBootstrapProgram } from "./bootstrap/program";

if (import.meta.main) {
  const exitCode = await runBootstrapProgram();
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

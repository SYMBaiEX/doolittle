import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BootstrapAbortError } from "./bootstrap/abort";

describe("bootstrap program", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("returns a non-zero status when the wizard aborts", async () => {
    mock.module("./bootstrap/core/env-file", () => ({
      ensureEnvFile: () => [],
      readEnvEntries: () => new Map<string, string>(),
    }));
    mock.module("./bootstrap/persistence/apply", () => ({
      applyBootstrapAnswers: mock(async () => {
        throw new Error("apply should not run after an abort");
      }),
    }));
    mock.module("./bootstrap/wizard/dependencies", () => ({
      getDependencyProbes: () => [],
    }));
    mock.module("./bootstrap/wizard-flow", () => ({
      runWizard: mock(async () => {
        throw new BootstrapAbortError();
      }),
    }));

    const root = mkdtempSync(join(tmpdir(), "doolittle-bootstrap-"));
    try {
      const { runBootstrapProgram } = await import(
        `./bootstrap?bootstrap-tests=${Date.now()}-${Math.random()}`
      );

      await expect(runBootstrapProgram({ root })).resolves.toBe(1);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

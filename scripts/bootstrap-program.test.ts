import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("bootstrap program", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns a non-zero status when the wizard aborts", async () => {
    const { BootstrapAbortError } = await import("./bootstrap/abort");
    vi.doMock("./bootstrap/core/env-file", () => ({
      ensureEnvFile: () => [],
      readEnvEntries: () => new Map<string, string>(),
    }));
    vi.doMock("./bootstrap/persistence/apply", () => ({
      applyBootstrapAnswers: vi.fn(async () => {
        throw new Error("apply should not run after an abort");
      }),
    }));
    vi.doMock("./bootstrap/wizard/dependencies", () => ({
      getDependencyProbes: () => [],
    }));
    vi.doMock("./bootstrap/wizard-flow", () => ({
      runWizard: vi.fn(async () => {
        throw new BootstrapAbortError();
      }),
    }));

    const root = mkdtempSync(join(tmpdir(), "doolittle-bootstrap-"));
    try {
      const { runBootstrapProgram } = await import("./bootstrap");

      await expect(runBootstrapProgram({ root })).resolves.toBe(1);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("prints a file-level dry-run receipt in check mode", async () => {
    vi.doMock("./bootstrap/core/env-file", () => ({
      ensureEnvFile: () => [".env would be created"],
      readEnvEntries: () => new Map<string, string>(),
    }));
    vi.doMock("./bootstrap/wizard/dependencies", () => ({
      getDependencyProbes: () => [{ label: "Nub toolkit", installed: true }],
    }));
    vi.doMock("./bootstrap/wizard-flow", () => ({
      runWizard: vi.fn(async () => {
        throw new Error("wizard should not run in check mode");
      }),
    }));

    const root = mkdtempSync(join(tmpdir(), "doolittle-bootstrap-"));
    const lines: string[] = [];
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation((value?: unknown) => {
        lines.push(String(value ?? ""));
      });

    try {
      const { runBootstrapProgram } = await import("./bootstrap");

      await expect(
        runBootstrapProgram({ root, args: ["--check"] }),
      ).resolves.toBe(0);
    } finally {
      logSpy.mockRestore();
      rmSync(root, { force: true, recursive: true });
    }

    const output = lines.join("\n");

    expect(output).toContain("Doolittle bootstrap");
    expect(output).toContain("mode: check");
    expect(output).toContain("Files:");
    expect(output).toContain("- .env");
    expect(output).toContain("- .doolittle/settings.json");
    expect(output).toContain("- .doolittle/gateway/gateway.json");
    expect(output).toContain("- .doolittle/onboarding.json");
    expect(output).toContain("- .doolittle/onboarding.state.json");
    expect(output).toContain("- Nub toolkit: online");
    expect(output).toContain("- .env would be created");
  });
});

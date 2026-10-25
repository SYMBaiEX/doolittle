import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { resolveEntrypointRuntimePlan } from "../../apps/cli/src/entrypoint/runtime-control";
import { handleEntrypointRuntimeSurface } from "../../apps/cli/src/entrypoint/runtime-surface";
import { resolveApplicationRoot } from "../../packages/agent/src/config/env/paths";
import type { AppLogger } from "../../packages/agent/src/logging/logger";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";

describe("terminal application lifecycle", () => {
  it.each(["cli", "both"] as const)(
    "only starts an API listener when mode=%s requests it",
    async (mode) => {
      const startServer = vi.fn();
      const shutdown = vi.fn();
      const exit = vi.fn();
      const runtimePlan = resolveEntrypointRuntimePlan({
        command: "start",
        shellIsInteractive: true,
        mode,
        stdinIsTTY: true,
      });
      await handleEntrypointRuntimeSurface({
        command: "start",
        shellIsInteractive: true,
        runtimePlan,
        context: { runtime: {}, config: { mode } } as AppContext,
        runtimeLogger: { info: vi.fn() } as unknown as AppLogger,
        startServerWhenShellReady: startServer,
        startCli: async (_context, options) => {
          options?.onReady?.();
          return 0;
        },
        shutdownRuntime: shutdown,
        exit,
        bootLogs: [],
      });
      expect(startServer).toHaveBeenCalledTimes(mode === "both" ? 1 : 0);
      expect(shutdown).toHaveBeenCalledTimes(mode === "cli" ? 1 : 0);
      expect(exit).toHaveBeenCalledTimes(mode === "cli" ? 1 : 0);
    },
  );

  it("finds the application root from both source modules and a bundled CLI", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-root-discovery-"));
    try {
      writeFileSync(
        resolve(root, "package.json"),
        JSON.stringify({
          name: "doolittle",
          workspaces: ["apps/*", "packages/*"],
        }),
      );
      mkdirSync(resolve(root, "apps/cli/dist"), { recursive: true });
      mkdirSync(resolve(root, "packages/agent/src/config/env"), {
        recursive: true,
      });
      writeFileSync(
        resolve(root, "apps/cli/package.json"),
        JSON.stringify({ name: "@doolittle/cli" }),
      );
      for (const entry of [
        "apps/cli/dist/index.js",
        "packages/agent/src/config/env/paths.ts",
      ])
        expect(
          resolveApplicationRoot(pathToFileURL(resolve(root, entry)).href),
        ).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

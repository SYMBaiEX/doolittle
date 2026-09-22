import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bundleSmithersRuntime,
  relocateSmithersRunner,
  SMITHERS_RUNTIME_ASSET,
} from "./smithers-runtime";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const require = createRequire(resolve(repoRoot, "package.json"));
const sdkManifest = JSON.parse(
  readFileSync(
    require.resolve("@elizaos/plugin-agent-orchestrator/package.json"),
    "utf8",
  ),
) as { version: string };
const sdkSource = readFileSync(
  require.resolve("@elizaos/plugin-agent-orchestrator"),
  "utf8",
);

describe("packaged native Smithers task runner", () => {
  let directory: string;
  let packagedRunner: string;

  beforeAll(async () => {
    directory = mkdtempSync(resolve(tmpdir(), "doolittle-smithers-"));
    const bundleDirectory = resolve(directory, "Runtime with spaces");
    mkdirSync(bundleDirectory);
    await bundleSmithersRuntime(repoRoot, bundleDirectory);
    const relocated = relocateSmithersRunner(sdkSource, sdkManifest.version);
    const start = relocated.indexOf("function createTaskScript() {");
    const end = relocated.indexOf("async function runTaskWithSmithers", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    packagedRunner = resolve(bundleDirectory, "sdk-runner.mjs");
    // Exercise the actual SDK-generated workflow, not a hand-written facsimile.
    writeFileSync(
      packagedRunner,
      `const DEFAULT_MAX_TURNS = 2;\nexport ${relocated.slice(start, end)}`,
    );
  }, 30_000);

  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("relocates both generated imports and disables Bun auto-install", () => {
    const result = relocateSmithersRunner(sdkSource, sdkManifest.version);
    expect(result).not.toContain(
      "import { Smithers } from 'smithers-orchestrator'",
    );
    expect(result).not.toContain("import { Effect, Schema } from 'effect'");
    expect(result).toContain(SMITHERS_RUNTIME_ASSET);
    expect(result).toContain('["--no-install", "-e", createTaskScript()]');
    expect(result).toContain("cwd: pluginRoot");
  });

  it("requires review if the SDK version or generated runner changes", () => {
    expect(() => relocateSmithersRunner(sdkSource, "2.1.0")).toThrow(
      "Review Smithers",
    );
    expect(() =>
      relocateSmithersRunner("changed", sdkManifest.version),
    ).toThrow("boundary changed");
    expect(() =>
      relocateSmithersRunner(`${sdkSource}\n${sdkSource}`, sdkManifest.version),
    ).toThrow("boundary changed");
  });

  it("executes the native SQLite workflow from an unrelated cwd without package resolution or auto-install", async () => {
    const workspace = resolve(directory, "unrelated-workspace");
    const cache = resolve(directory, "unused-bun-cache");
    mkdirSync(workspace);
    const dbPath = resolve(workspace, "native-task.sqlite");
    const { createTaskScript } = (await import(
      pathToFileURL(packagedRunner).href
    )) as { createTaskScript(): string };
    const script = createTaskScript();
    const child = spawn(
      process.env.BUN_BIN || "bun",
      ["--no-install", "-e", script],
      {
        cwd: workspace,
        env: {
          PATH: process.env.PATH,
          BUN_INSTALL_CACHE_DIR: cache,
          ELIZA_TASK_RUN_PAYLOAD: JSON.stringify({
            taskId: "packaged-native-smoke",
            runId: "packaged-native-smoke",
            workflowName: "packaged-native-smoke",
            initialPrompt:
              "Verify the packaged native runner without invoking a provider.",
            parallelAgents: 1,
            maxTurns: 2,
            dbPath,
            rootDir: workspace,
          }),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const steps: string[] = [];
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      stdout += `${line}\n`;
      if (!line.startsWith("{")) return;
      const message = JSON.parse(line) as {
        type: string;
        requestId: string;
        kind: string;
      };
      if (message.type !== "executeStep") return;
      steps.push(message.kind);
      child.stdin.write(
        `${JSON.stringify({ requestId: message.requestId, ok: true, output: { done: true } })}\n`,
      );
    });
    const exit = await new Promise<number | null>((done, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          new Error(`Native packaged Smithers runner timed out: ${stderr}`),
        );
      }, 15_000);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        done(code);
      });
    });
    expect(stderr, stdout).toBe("");
    expect(exit).toBe(0);
    expect(steps).toEqual(["turn"]);
    expect(existsSync(dbPath)).toBe(true);
    expect(existsSync(cache)).toBe(false);
    expect(existsSync(resolve(workspace, "node_modules"))).toBe(false);
  }, 20_000);
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_PATH = join(
  process.cwd(),
  "scripts",
  "publish-provider-packages.ts",
);

function buildPackageRoot(options: {
  codexDependencies?: string;
  claudeDependencies?: string;
}): { root: string; binDir: string } {
  const root = mkdtempSync(join(tmpdir(), "doolittle-publish-"));
  const plugins = join(root, "packages", "plugins");
  const pluginCodex = join(plugins, "plugin-codex");
  const pluginClaude = join(plugins, "plugin-claude-code");
  const binDir = join(root, "node_modules", ".bin");
  const npmPath = join(root, "tmp-bin");

  mkdirSync(pluginCodex, { recursive: true });
  mkdirSync(pluginClaude, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(npmPath, { recursive: true });

  writeFileSync(
    join(pluginCodex, "package.json"),
    JSON.stringify(
      {
        name: "@doolittle/plugin-codex",
        version: "0.0.1",
        dependencies: parseDependencies(options?.codexDependencies),
      },
      null,
      2,
    ),
    "utf8",
  );

  writeFileSync(
    join(pluginClaude, "package.json"),
    JSON.stringify(
      {
        name: "@doolittle/plugin-claude-code",
        version: "0.0.1",
        dependencies: parseDependencies(options?.claudeDependencies),
      },
      null,
      2,
    ),
    "utf8",
  );

  return { root, binDir: npmPath };
}

function parseDependencies(value = "{}"): Record<string, string> {
  return JSON.parse(value) as Record<string, string>;
}

function createFakeNpm(
  binDir: string,
  exitCode: number,
  includeOutput: string,
): void {
  const scriptPath = join(binDir, "npm");
  const script = `#!/usr/bin/env sh
if [ "$1" = "publish" ]; then
  echo "${includeOutput}" "publish " "$@" >/dev/stderr
else
  echo "${includeOutput}" "pack " "$@" >/dev/stderr
fi
exit ${exitCode}
`;
  writeFileSync(scriptPath, script, "utf8");
  chmodSync(scriptPath, 0o755);
}

function runPublish(
  cwd: string,
  binDir: string,
  args: string[],
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync({
    cmd: ["bun", SCRIPT_PATH, ...args],
    cwd,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    status: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

let fixtureRoot = "";

beforeEach(() => {
  fixtureRoot = "";
});

afterEach(() => {
  if (fixtureRoot) {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

describe("publish-provider-packages", () => {
  it("marks standalone dependency plugins as npm-publish in dry-run", () => {
    const { root, binDir } = buildPackageRoot({});
    fixtureRoot = root;
    createFakeNpm(binDir, 0, "ok");

    const result = runPublish(root, binDir, ["--provider", "codex", "--json"]);
    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout.trim());
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0].provider).toBe("codex");
    expect(payload.results[0].recommendedFlow).toBe("npm-publish");
    expect(payload.results[0].ok).toBe(true);
    expect(payload.results[0].command).toContain("npm pack --dry-run");
  });

  it("chooses monorepo release when workspace dependency is present", () => {
    const { root, binDir } = buildPackageRoot({
      codexDependencies: JSON.stringify({
        "@doolittle/shared": "workspace:*",
      }),
    });
    fixtureRoot = root;
    createFakeNpm(binDir, 0, "ok");

    const result = runPublish(root, binDir, ["--provider", "codex", "--json"]);
    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout.trim());
    expect(payload.results[0].recommendedFlow).toBe("eliza-monorepo-release");
  });

  it("forwards publish and otp args through the npm command", () => {
    const { root, binDir } = buildPackageRoot({
      codexDependencies: "{}",
    });
    fixtureRoot = root;
    createFakeNpm(binDir, 0, "ok");

    const result = runPublish(root, binDir, [
      "--provider",
      "codex",
      "--publish",
      "--otp",
      "777",
      "--tag",
      "rc",
      "--json",
    ]);

    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout.trim());
    expect(payload.results[0].command).toBe("npm publish --tag rc --otp 777");
  });

  it("fails if the npm command fails", () => {
    const { root, binDir } = buildPackageRoot({
      codexDependencies: "{}",
    });
    fixtureRoot = root;
    createFakeNpm(binDir, 3, "publish fail");

    const result = runPublish(root, binDir, [
      "--provider",
      "codex",
      "--publish",
    ]);

    expect(result.status).toBe(1);
  });
});

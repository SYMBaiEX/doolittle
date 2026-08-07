import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = join(
  process.cwd(),
  "scripts",
  "publish-provider-packages.ts",
);
const NUB_PATH = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "nub.cmd" : "nub",
);

function writePackageFixture(
  root: string,
  directory: string,
  name: string,
  dependencies: Record<string, string> = {},
) {
  const packagePath = join(root, "packages", "plugins", directory);
  const sourcePath = join(packagePath, "src");
  mkdirSync(sourcePath, { recursive: true });
  writeFileSync(
    join(packagePath, "package.json"),
    JSON.stringify(
      {
        name,
        version: "0.0.1",
        type: "module",
        dependencies,
        exports: {
          ".": "./src/index.ts",
        },
        files: ["src/**/*.ts", "!src/**/*.test.ts", "README.md"],
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(join(packagePath, "README.md"), "# Fixture\n", "utf8");
  writeFileSync(
    join(sourcePath, "index.ts"),
    "export const fixture = true;\n",
    "utf8",
  );
}

function buildPackageRoot(dependencies: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "doolittle-publish-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ overrides: { protobufjs: "7.6.5", tar: "7.5.22" } }),
    "utf8",
  );
  writePackageFixture(
    root,
    "provider-transport",
    "@doolittle/provider-transport",
  );
  writePackageFixture(
    root,
    "plugin-claude-code",
    "@doolittle/plugin-claude-code",
    dependencies,
  );
  return root;
}

function runPublish(
  cwd: string,
  args: string[],
  pathPrefix?: string,
): { status: number | null; stdout: string; stderr: string } {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  const result = spawnSync(NUB_PATH, [SCRIPT_PATH, ...args], {
    cwd,
    env: {
      ...environment,
      PATH: pathPrefix
        ? `${pathPrefix}${delimiter}${process.env.PATH}`
        : process.env.PATH,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function createFailingNpm(root: string): string {
  const binPath = join(root, "bin");
  mkdirSync(binPath, { recursive: true });
  const scriptPath = join(
    binPath,
    process.platform === "win32" ? "npm.cmd" : "npm",
  );
  writeFileSync(
    scriptPath,
    process.platform === "win32"
      ? "@echo off\necho pack-failed 1>&2\nexit /b 3\n"
      : "#!/usr/bin/env sh\necho pack-failed >&2\nexit 3\n",
    "utf8",
  );
  if (process.platform !== "win32") {
    chmodSync(scriptPath, 0o755);
  }
  return binPath;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("publish-provider-packages", () => {
  it("documents an explicit publish flag for the publishing command", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    expect(readme).toContain(
      "nub run publish:providers -- --provider all --publish       # publish all",
    );
    expect(readme).not.toContain(
      "nub run publish:providers -- --provider all                 # publish all",
    );
  });

  it("keeps the workspace manifest source-resolvable while packing dist artifacts", () => {
    const root = buildPackageRoot();
    roots.push(root);

    const result = runPublish(root, ["--provider", "claude-code", "--json"]);
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      results: Array<{
        ok: boolean;
        command: string;
        detail: string;
        output?: string;
      }>;
    };
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]).toMatchObject({
      ok: true,
      detail:
        "Built dist JavaScript and declarations, then security-audited and imported the packed artifact with Doolittle's audited transitive security overrides in an isolated consumer.",
    });
    expect(payload.results[0].command).toContain(
      "npm install --ignore-scripts",
    );
    expect(payload.results[0].command).toContain(
      "npm audit --audit-level critical --omit dev",
    );
    expect(payload.results[0].command).toContain(
      "doolittle-provider-transport-0.0.1.tgz",
    );

    const manifest = JSON.parse(
      readFileSync(
        join(root, "packages", "plugins", "plugin-claude-code", "package.json"),
        "utf8",
      ),
    ) as { exports: { ".": string }; files: string[] };
    expect(manifest.exports["."]).toBe("./src/index.ts");
    expect(manifest.files).toContain("src/**/*.ts");
  });

  it("fails before publish when packaging cannot produce an artifact", () => {
    const root = buildPackageRoot();
    roots.push(root);
    const binPath = createFailingNpm(root);

    const result = runPublish(
      root,
      ["--provider", "claude-code", "--publish", "--tag", "rc", "--json"],
      binPath,
    );
    expect(result.status).toBe(1);

    const payload = JSON.parse(result.stdout) as {
      results: Array<{ ok: boolean; command: string; output?: string }>;
    };
    expect(payload.results[0].ok).toBe(false);
    expect(payload.results[0].command).toBe("build/pack/import");
    expect(payload.results[0].output).toContain("pack-failed");
    expect(readdirSync(join(root, ".doolittle"))).toEqual([]);
  });

  it("rejects workspace dependencies before staging a standalone package", () => {
    const root = buildPackageRoot({ "@doolittle/private": "workspace:*" });
    roots.push(root);

    const result = runPublish(root, ["--provider", "claude-code", "--json"]);

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout) as {
      results: Array<{ ok: boolean; detail: string }>;
    };
    expect(payload.results[0]).toMatchObject({ ok: false });
    expect(payload.results[0].detail).toContain(
      "cannot be published standalone",
    );
  });

  it.each([
    { args: ["--provider"], expected: "--provider requires a provider name" },
    {
      args: ["--provider", "does-not-exist"],
      expected: "Unknown provider: does-not-exist",
    },
    { args: ["--tag"], expected: "--tag requires a dist-tag value" },
    { args: ["--unexpected"], expected: "Unknown argument: --unexpected" },
  ])("fails closed for invalid arguments", ({ args, expected }) => {
    const root = buildPackageRoot();
    roots.push(root);
    const result = runPublish(root, [...args, "--json"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(expected);
  });
});

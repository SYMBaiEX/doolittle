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
import { findMutableWorkflowActions } from "./check-workflow-security";

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
const PROVIDER_PUBLISH_WORKFLOW = join(
  process.cwd(),
  ".github",
  "workflows",
  "provider-publish.yml",
);
const TRUSTED_PUBLISH_ENVIRONMENT = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "SYMBaiEX/doolittle",
  GITHUB_WORKFLOW_REF:
    "SYMBaiEX/doolittle/.github/workflows/provider-publish.yml@refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/oidc",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test-oidc-token",
};

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
    JSON.stringify({ overrides: { protobufjs: "8.7.2", tar: "7.5.22" } }),
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
  environmentOverrides: Record<string, string> = {},
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
      ...environmentOverrides,
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

function createSecretEchoingNpm(root: string): string {
  const binPath = join(root, "secret-bin");
  mkdirSync(binPath, { recursive: true });
  const scriptPath = join(
    binPath,
    process.platform === "win32" ? "npm.cmd" : "npm",
  );
  writeFileSync(
    scriptPath,
    process.platform === "win32"
      ? "@echo off\necho %NPM_TOKEN% 1>&2\nexit /b 3\n"
      : "#!/usr/bin/env sh\nprintf '%s\\n' \"$NPM_TOKEN\" >&2\nexit 3\n",
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
  it("keeps published CLI providers independent from the Eliza agent package", () => {
    for (const directory of ["plugin-claude-code", "plugin-devin"]) {
      const manifest = JSON.parse(
        readFileSync(
          join(process.cwd(), "packages", "plugins", directory, "package.json"),
          "utf8",
        ),
      ) as { dependencies?: Record<string, string> };
      expect(manifest.dependencies?.["@elizaos/agent"]).toBeUndefined();
      expect(manifest.dependencies?.["@elizaos/core"]).toBe("2.0.3-beta.7");
    }
  });

  it("uses the protected OIDC provider workflow with provenance publishing", () => {
    const script = readFileSync(SCRIPT_PATH, "utf8");
    const workflow = readFileSync(PROVIDER_PUBLISH_WORKFLOW, "utf8");

    expect(script).toContain('["publish", "--tag", tag, "--provenance"]');
    expect(script).toContain("assertTrustedPublishEnvironment");
    expect(script).toContain("verifyPublishedRegistryPackage");
    expect(script).toMatch(/\$\{manifest\.name\}@\$\{manifest\.version\}/u);
    expect(script).not.toContain('args.push("--otp", otp)');
    expect(script).toContain('"--ignoreConfig"');
    expect(workflow).toContain('      - "provider-v*"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("release_tag:");
    expect(workflow).toContain("environment: npm-publish");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("nub run typecheck");
    expect(workflow).toContain("nub run test");
    expect(workflow).toContain("nub run build");
    expect(workflow).toContain("nub run check:eliza-sdk");
    expect(workflow).toContain(
      "Build, audit at high severity, and publish provider packages",
    );
    expect(workflow).toContain(
      'nub run publish:providers -- --provider all --publish --tag "$dist_tag"',
    );
    expect(workflow).not.toContain("NODE_AUTH_TOKEN");
    expect(workflow).not.toContain("NPM_TOKEN");
    expect(
      findMutableWorkflowActions(
        workflow,
        ".github/workflows/provider-publish.yml",
      ),
    ).toEqual([]);
  });

  it("documents dry-run-only local provider publishing", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    expect(readme).toContain(
      "Live publishing is restricted to the protected GitHub Actions OIDC workflow",
    );
    expect(readme).not.toContain(
      "nub run publish:providers -- --provider all --publish       # publish all",
    );
  });

  it("redacts credential sentinels from JSON, text, and argument errors", () => {
    const root = buildPackageRoot();
    roots.push(root);
    const binPath = createSecretEchoingNpm(root);
    const sentinel = "provider-publish-secret-sentinel";

    const json = runPublish(
      root,
      ["--provider", "claude-code", "--json"],
      binPath,
      { NPM_TOKEN: sentinel },
    );
    const text = runPublish(root, ["--provider", "claude-code"], binPath, {
      NPM_TOKEN: sentinel,
    });
    const argumentError = runPublish(root, [`--_auth=${sentinel}`, "--json"]);

    expect(json.status).toBe(1);
    expect(text.status).toBe(1);
    expect(argumentError.status).toBe(1);
    expect(`${json.stdout}\n${json.stderr}`).not.toContain(sentinel);
    expect(`${text.stdout}\n${text.stderr}`).not.toContain(sentinel);
    expect(`${argumentError.stdout}\n${argumentError.stderr}`).not.toContain(
      sentinel,
    );
    expect(json.stdout).toContain("[REDACTED]");
    expect(text.stdout).toContain("[REDACTED]");
    expect(argumentError.stderr).toContain(
      "Secret-bearing publish arguments are not supported.",
    );
  });

  it("fails closed for local live publishing before invoking npm", () => {
    const root = buildPackageRoot();
    roots.push(root);
    const result = runPublish(root, ["--provider", "claude-code", "--publish"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "Live provider publishing is restricted to the trusted GitHub Actions OIDC workflow.",
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
      "npm audit --audit-level high --omit dev",
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
      TRUSTED_PUBLISH_ENVIRONMENT,
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

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
const SYSTEM_NPM = spawnSync("which", ["npm"], {
  encoding: "utf8",
}).stdout.trim();
const itWithPosixNpm = process.platform === "win32" ? it.skip : it;

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function trustedReleaseEnvironment(root: string): Record<string, string> {
  runGit(root, ["init", "--quiet"]);
  runGit(root, ["config", "user.name", "Doolittle test"]);
  runGit(root, ["config", "user.email", "test@example.invalid"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "--quiet", "-m", "fixture"]);
  runGit(root, ["tag", "provider-v0.0.1"]);
  const commit = runGit(root, ["rev-parse", "HEAD"]);
  return {
    ...TRUSTED_PUBLISH_ENVIRONMENT,
    PUBLISH_RELEASE_TAG: "provider-v0.0.1",
    PUBLISH_RELEASE_COMMIT: commit,
  };
}

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
  writePackageFixture(root, "plugin-devin", "@doolittle/plugin-devin");
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

function createAuditPassingNpm(root: string): string {
  return createOfflineNpm(root, "audit-bin");
}

/**
 * The publishing script deliberately verifies the tarball through a fresh,
 * plain consumer.  That is useful production coverage, but a fixture must
 * not turn it into an npm-registry integration test: npm can spend minutes
 * retrying metadata requests even when every install target is a local tgz.
 *
 * Keep the real `npm pack` step (and force it offline), then install fixture
 * tarballs with tar.  This preserves the two assertions that matter here:
 * the staged artifact is packable and Node can import what a consumer gets.
 */
function createOfflineNpm(
  root: string,
  directory: string,
  script = "",
): string {
  if (process.platform === "win32" || !SYSTEM_NPM) {
    throw new Error("This test fixture requires a POSIX npm executable.");
  }
  const binPath = join(root, directory);
  mkdirSync(binPath, { recursive: true });
  const scriptPath = join(binPath, "npm");
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env sh
set -eu
${script}

if [ "$1" = audit ]; then
  exit 0
fi

if [ "$1" = pack ]; then
  exec ${JSON.stringify(SYSTEM_NPM)} --offline "$@"
fi

if [ "$1" = install ]; then
  for argument in "$@"; do
    if [ -f "$argument" ] && [ "\${argument##*.}" = tgz ]; then
      extract_path=$(mktemp -d)
      tar -xzf "$argument" -C "$extract_path"
      package_name=$(node -e 'console.log(require(process.argv[1]).name)' "$extract_path/package/package.json")
      destination="$PWD/node_modules/$package_name"
      mkdir -p "$(dirname "$destination")"
      if [ -e "$destination" ]; then
        printf '%s\\n' "fixture destination already exists: $destination" >&2
        exit 65
      fi
      mv "$extract_path/package" "$destination"
      rmdir "$extract_path"
    fi
  done
  exit 0
fi

printf '%s\\n' "unexpected npm command: $*" >&2
exit 64
`,
    "utf8",
  );
  chmodSync(scriptPath, 0o755);
  return binPath;
}

function createRecordingNpm(root: string, script: string): string {
  return createOfflineNpm(root, "recording-bin", script);
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
    expect(workflow).toContain(
      "ref: refs/tags/$" + "{{ inputs.release_tag || github.ref_name }}",
    );
    expect(workflow).toContain(
      "Bind publishing to the exact release-tag commit",
    );
    expect(workflow).toContain('git show-ref --verify --quiet "$tag_ref"');
    expect(workflow).toContain('git rev-parse --verify "$' + '{tag_ref}^{}"');
    expect(workflow).toContain("PUBLISH_RELEASE_COMMIT=$tag_commit");
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

  it("requires the workflow's exact tag commit for live publishing", () => {
    const root = buildPackageRoot();
    roots.push(root);
    const result = runPublish(root, ["--provider", "claude-code", "--publish"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Live provider publishing is restricted to the trusted GitHub Actions OIDC workflow.",
    );

    const trustedWithoutRelease = runPublish(
      root,
      ["--provider", "claude-code", "--publish"],
      undefined,
      TRUSTED_PUBLISH_ENVIRONMENT,
    );
    expect(trustedWithoutRelease.status).toBe(1);
    expect(trustedWithoutRelease.stderr).toContain(
      "Live provider publishing requires a verified provider-v<semver> release tag.",
    );

    const taggedEnvironment = trustedReleaseEnvironment(root);
    const mismatchedCommit = runPublish(
      root,
      ["--provider", "claude-code", "--publish"],
      undefined,
      {
        ...taggedEnvironment,
        PUBLISH_RELEASE_COMMIT: "0".repeat(40),
      },
    );
    expect(mismatchedCommit.status).toBe(1);
    expect(mismatchedCommit.stderr).toContain(
      "Live provider publishing requires source checked out at the verified release-tag commit.",
    );

    const branchOnlyRoot = buildPackageRoot();
    roots.push(branchOnlyRoot);
    runGit(branchOnlyRoot, ["init", "--quiet"]);
    runGit(branchOnlyRoot, ["config", "user.name", "Doolittle test"]);
    runGit(branchOnlyRoot, ["config", "user.email", "test@example.invalid"]);
    runGit(branchOnlyRoot, ["add", "."]);
    runGit(branchOnlyRoot, ["commit", "--quiet", "-m", "branch-only fixture"]);
    const branchCommit = runGit(branchOnlyRoot, ["rev-parse", "HEAD"]);
    runGit(branchOnlyRoot, ["branch", "provider-v0.0.1"]);
    const branchOnly = runPublish(
      branchOnlyRoot,
      ["--provider", "claude-code", "--publish"],
      undefined,
      {
        ...TRUSTED_PUBLISH_ENVIRONMENT,
        PUBLISH_RELEASE_TAG: "provider-v0.0.1",
        PUBLISH_RELEASE_COMMIT: branchCommit,
      },
    );
    expect(branchOnly.status).toBe(1);
    expect(branchOnly.stderr).toContain(
      "Live provider publishing requires source checked out at the verified release-tag commit.",
    );
  });

  itWithPosixNpm(
    "keeps the workspace manifest source-resolvable while packing dist artifacts",
    () => {
      const root = buildPackageRoot();
      roots.push(root);

      const result = runPublish(
        root,
        ["--provider", "claude-code", "--json"],
        createAuditPassingNpm(root),
      );
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
          "Built dist JavaScript and declarations, then security-audited and imported the packed artifact in an isolated consumer.",
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
          join(
            root,
            "packages",
            "plugins",
            "plugin-claude-code",
            "package.json",
          ),
          "utf8",
        ),
      ) as { exports: { ".": string }; files: string[] };
      expect(manifest.exports["."]).toBe("./src/index.ts");
      expect(manifest.files).toContain("src/**/*.ts");
    },
  );

  itWithPosixNpm(
    "uses a plain consumer manifest even when the workspace has overrides",
    () => {
      const root = buildPackageRoot();
      roots.push(root);
      const capturedManifest = join(root, "consumer-package.json");
      const binPath = createRecordingNpm(
        root,
        `if [ "$1" = install ] && printf '%s' "$PWD" | grep -q doolittle-provider-consumer; then cp package.json ${JSON.stringify(capturedManifest)}; fi
`,
      );

      const result = runPublish(
        root,
        ["--provider", "claude-code", "--json"],
        binPath,
      );

      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(JSON.parse(readFileSync(capturedManifest, "utf8"))).toEqual({
        private: true,
        type: "module",
      });
    },
  );

  itWithPosixNpm(
    "does not publish any provider when a later packed-consumer preflight fails",
    () => {
      const root = buildPackageRoot();
      roots.push(root);
      const commandLog = join(root, "npm-commands.log");
      const auditCount = join(root, "audit-count");
      const binPath = createRecordingNpm(
        root,
        `printf '%s\\n' "$1" >> ${JSON.stringify(commandLog)}
if [ "$1" = audit ]; then
  count=0; [ -f ${JSON.stringify(auditCount)} ] && count=$(cat ${JSON.stringify(auditCount)})
  count=$((count + 1)); printf '%s' "$count" > ${JSON.stringify(auditCount)}
  [ "$count" -ge 2 ] && exit 3
  exit 0
fi
if [ "$1" = publish ]; then exit 0; fi
`,
      );

      const result = runPublish(
        root,
        ["--provider", "all", "--publish", "--json"],
        binPath,
        trustedReleaseEnvironment(root),
      );

      expect(result.status).toBe(1);
      expect(readFileSync(commandLog, "utf8").split("\n")).not.toContain(
        "publish",
      );
    },
  );

  itWithPosixNpm(
    "audits an exact registry consumer before its import verification",
    () => {
      const root = buildPackageRoot();
      roots.push(root);
      const eventLog = join(root, "registry-events.log");
      const binPath = createRecordingNpm(
        root,
        `if [ "$1" = publish ]; then printf '%s\\n' publish >> ${JSON.stringify(eventLog)}; exit 0; fi
if [ "$1" = install ] && printf '%s' "$*" | grep -q '@doolittle/plugin-claude-code@0.0.1'; then
  printf '%s\\n' registry-install >> ${JSON.stringify(eventLog)}
  mkdir -p node_modules/@doolittle/plugin-claude-code
  printf '%s' '{"name":"@doolittle/plugin-claude-code","version":"0.0.1","type":"module","exports":"./index.js"}' > node_modules/@doolittle/plugin-claude-code/package.json
  printf '%s' 'export const fixture = true;' > node_modules/@doolittle/plugin-claude-code/index.js
  exit 0
fi
if [ "$1" = audit ]; then
  if printf '%s' "$PWD" | grep -q doolittle-provider-registry-receipt; then printf '%s\\n' registry-audit >> ${JSON.stringify(eventLog)}; fi
fi
`,
      );

      const result = runPublish(
        root,
        ["--provider", "claude-code", "--publish", "--json"],
        binPath,
        trustedReleaseEnvironment(root),
      );

      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(readFileSync(eventLog, "utf8").trim().split("\n")).toEqual([
        "publish",
        "registry-install",
        "registry-audit",
      ]);
      const payload = JSON.parse(result.stdout) as {
        results: Array<{ command: string; ok: boolean }>;
      };
      expect(payload.results[0]).toMatchObject({ ok: true });
      expect(payload.results[0]?.command).toContain(
        "npm audit --audit-level high --omit dev",
      );
    },
  );

  itWithPosixNpm(
    "reports later providers as not published when an earlier registry receipt fails",
    () => {
      const root = buildPackageRoot();
      roots.push(root);
      const eventLog = join(root, "failed-registry-events.log");
      const binPath = createRecordingNpm(
        root,
        `if [ "$1" = publish ]; then printf '%s\\n' publish >> ${JSON.stringify(eventLog)}; exit 0; fi
if [ "$1" = install ] && printf '%s' "$*" | grep -q '@doolittle/provider-transport@0.0.1'; then
  printf '%s\\n' registry-install-failed >> ${JSON.stringify(eventLog)}
  exit 7
fi
`,
      );

      const result = runPublish(
        root,
        ["--provider", "all", "--publish", "--json"],
        binPath,
        trustedReleaseEnvironment(root),
      );

      expect(result.status).toBe(1);
      expect(readFileSync(eventLog, "utf8").trim().split("\n")).toEqual([
        "publish",
        "registry-install-failed",
      ]);
      const payload = JSON.parse(result.stdout) as {
        results: Array<{ command: string; detail: string; ok: boolean }>;
      };
      expect(payload.results).toHaveLength(3);
      expect(payload.results[0]).toMatchObject({ ok: false });
      expect(payload.results.slice(1)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ok: false,
            command: "not-published",
            detail:
              "Not published because an earlier provider failed publishing or registry verification.",
          }),
        ]),
      );
      expect(payload.results.slice(1).every((entry) => !entry.ok)).toBe(true);
    },
  );

  it("fails before publish when packaging cannot produce an artifact", () => {
    const root = buildPackageRoot();
    roots.push(root);
    const binPath = createFailingNpm(root);

    const result = runPublish(
      root,
      ["--provider", "claude-code", "--publish", "--tag", "rc", "--json"],
      binPath,
      trustedReleaseEnvironment(root),
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

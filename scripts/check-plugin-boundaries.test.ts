import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_PATH = join(
  process.cwd(),
  "scripts",
  "check-plugin-boundaries.ts",
);

function createBoundaryFixture(options: {
  includeInternalFacadeViolation?: boolean;
}): string {
  const root = mkdtempSync(join(tmpdir(), "doolittle-boundary-"));

  const packagesDir = join(root, "packages");
  const requiredDirs = [
    join(packagesDir, "plugins"),
    join(packagesDir, "plugins", "plugin-dummy"),
    join(packagesDir, "agent", "src", "services"),
    join(packagesDir, "agent", "src", "gateway"),
    join(packagesDir, "agent", "src", "runtime"),
    join(packagesDir, "agent", "src", "runtime", "native"),
    join(packagesDir, "contracts", "src"),
    join(root, "scripts", "bootstrap"),
  ];

  for (const dir of requiredDirs) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(
    join(packagesDir, "plugins", "plugin-dummy", "index.ts"),
    'export const plugin = "ok";\n',
    "utf8",
  );

  const serviceFile = join(packagesDir, "agent", "src", "services", "bad.ts");
  if (options.includeInternalFacadeViolation) {
    writeFileSync(
      serviceFile,
      'import { bad } from "@/services/media-service";\nexport const ignored = bad;\n',
      "utf8",
    );
  } else {
    writeFileSync(
      serviceFile,
      'export const good = "internal-clean";\n',
      "utf8",
    );
  }

  return root;
}

function runScript(cwd: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync({
    cmd: ["bun", SCRIPT_PATH],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    status: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

let fixture = "";

beforeEach(() => {
  fixture = "";
});

afterEach(() => {
  if (fixture) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe("check-plugin-boundaries", () => {
  it("passes when all plugin and internal imports are canonical", () => {
    fixture = createBoundaryFixture({});
    const result = runScript(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Plugin boundary / internal facade check passed.",
    );
  });

  it("reports internal service facade violations", () => {
    fixture = createBoundaryFixture({ includeInternalFacadeViolation: true });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "imports through a service compatibility facade instead of a folder-owned module",
    );
    expect(result.stderr).toContain("bad.ts");
  });
});

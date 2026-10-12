import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const rootRequire = createRequire(
  resolve(import.meta.dirname, "../package.json"),
);
const sqlPackage = rootRequire.resolve("@elizaos/plugin-sql/package.json");
const entrypoint = pathToFileURL(
  rootRequire.resolve("@elizaos/plugin-sql"),
).href;
const commonJsBundle = resolve(
  dirname(sqlPackage),
  "src/dist/cjs/index.node.cjs",
);
const markerName = "DOOLITTLE_SQL_ENV_AUTHORITY_PROBE";
const agentId = "00000000-0000-4000-8000-000000000001";

function probeAdapter(input: {
  entry: "public" | "cjs";
  cwd: string;
  explicitDir?: string;
  inheritedDir?: string;
}) {
  const child = `
    const envBefore = JSON.stringify(process.env);
    const load = ${
      input.entry === "public"
        ? `import(${JSON.stringify(entrypoint)})`
        : `import(${JSON.stringify(pathToFileURL(commonJsBundle).href)})`
    };
    const mod = await load;
    const createDatabaseAdapter = mod.createDatabaseAdapter ?? mod.default?.createDatabaseAdapter;
    createDatabaseAdapter(
      ${JSON.stringify(input.explicitDir ? { dataDir: input.explicitDir } : {})},
      ${JSON.stringify(agentId)},
    );
    process.stdout.write("SQL_ENV_PROBE:" + JSON.stringify({
      markerLoaded: Object.hasOwn(process.env, ${JSON.stringify(markerName)}),
      inheritedDir: process.env.PGLITE_DATA_DIR ?? null,
      envUnchanged: JSON.stringify(process.env) === envBefore,
    }) + "\\n");
    process.exit(0);
  `;
  const privateHome = resolve(input.cwd, ".probe-home");
  mkdirSync(privateHome, { recursive: true });
  // Never let a fixture select a real PostgreSQL URL or SDK account store.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: privateHome,
    ELIZA_HOME: privateHome,
    ELIZA_CONFIG_PATH: resolve(privateHome, "eliza.json"),
  };
  if (input.inheritedDir !== undefined)
    env.PGLITE_DATA_DIR = input.inheritedDir;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", child],
    {
      cwd: input.cwd,
      env,
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const line = result.stdout
    .split("\n")
    .find((value) => value.startsWith("SQL_ENV_PROBE:"));
  if (!line) throw new Error("SQL adapter probe did not report a result");
  return JSON.parse(line.slice("SQL_ENV_PROBE:".length)) as {
    markerLoaded: boolean;
    inheritedDir: string | null;
    envUnchanged: boolean;
  };
}

describe("published SQL adapter environment authority", () => {
  it("does not load cwd or ancestor dotenv through public Node or CJS entrypoints", () => {
    const owned = mkdtempSync(resolve(tmpdir(), "doolittle-sql-env-"));
    try {
      const cwd = resolve(owned, "workspace", "nested");
      mkdirSync(cwd, { recursive: true });
      const dotenvDir = resolve(owned, "from-dotenv");
      writeFileSync(
        resolve(owned, "workspace", ".env"),
        `${markerName}=public-test-marker\nPGLITE_DATA_DIR=${dotenvDir}\n`,
      );

      for (const entry of ["public", "cjs"] as const) {
        const explicitDir = resolve(owned, `explicit-${entry}`);
        const inheritedDir = resolve(owned, `inherited-${entry}`);
        expect(probeAdapter({ entry, cwd, explicitDir, inheritedDir })).toEqual(
          { markerLoaded: false, inheritedDir, envUnchanged: true },
        );
        expect(existsSync(explicitDir)).toBe(true);
        expect(existsSync(inheritedDir)).toBe(false);

        expect(probeAdapter({ entry, cwd, inheritedDir })).toEqual({
          markerLoaded: false,
          inheritedDir,
          envUnchanged: true,
        });
        expect(existsSync(inheritedDir)).toBe(true);

        expect(probeAdapter({ entry, cwd })).toEqual({
          markerLoaded: false,
          inheritedDir: null,
          envUnchanged: true,
        });
        expect(existsSync(resolve(cwd, ".eliza", ".elizadb"))).toBe(true);
      }
      expect(existsSync(dotenvDir)).toBe(false);

      writeFileSync(
        resolve(cwd, ".env"),
        `${markerName}=cwd-public-test-marker\n`,
      );
      for (const entry of ["public", "cjs"] as const) {
        const explicitDir = resolve(owned, `cwd-explicit-${entry}`);
        expect(probeAdapter({ entry, cwd, explicitDir })).toEqual({
          markerLoaded: false,
          inheritedDir: null,
          envUnchanged: true,
        });
        expect(existsSync(explicitDir)).toBe(true);
      }
    } finally {
      rmSync(owned, { recursive: true, force: true });
    }
  });
});

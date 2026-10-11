import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureEnvFile, readEnvEntries, updateEnvFile } from "./env-file";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(join(tmpdir(), "doolittle-env-file-"));
  roots.push(root);
  const envPath = join(root, ".env");
  const envExamplePath = join(root, ".env.example");
  fs.writeFileSync(envExamplePath, "# config\nKEY=old\nOTHER=keep\n");
  return { root, envPath, envExamplePath, checkOnly: false };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe("bootstrap environment files", () => {
  it("creates private files and updates the same file while retaining unrelated entries", () => {
    const options = fixture();
    expect(ensureEnvFile(options)).toEqual([".env created from .env.example"]);
    expect(fs.statSync(options.envPath).mode & 0o777).toBe(0o600);
    updateEnvFile({ KEY: "new", ADDED: "value" }, options);
    expect(readEnvEntries(options.envPath)).toEqual(
      new Map([
        ["KEY", "new"],
        ["OTHER", "keep"],
        ["ADDED", "value"],
      ]),
    );
    updateEnvFile({ KEY: undefined, ADDED: undefined }, options);
    expect(readEnvEntries(options.envPath).get("KEY")).toBe("");
    expect(fs.readFileSync(options.envPath, "utf8")).not.toContain("value");
  });

  it("does not overwrite a race winner while copying the example", () => {
    const options = fixture();
    const read = actualFs.readFileSync;
    vi.mocked(fs.readFileSync).mockImplementationOnce(((
      ...args: Parameters<typeof fs.readFileSync>
    ) => {
      fs.writeFileSync(options.envPath, "KEY=race-winner\n");
      return read(...args);
    }) as typeof fs.readFileSync);
    expect(ensureEnvFile(options)).toEqual([".env already exists"]);
    expect(read(options.envPath, "utf8")).toBe("KEY=race-winner\n");
  });

  it("rejects symlink updates and dangling symlink creation without modifying the target", () => {
    const options = fixture();
    const target = join(options.root, "target");
    fs.symlinkSync(target, options.envPath);
    expect(ensureEnvFile(options)).toEqual([".env already exists"]);
    expect(fs.existsSync(target)).toBe(false);
    fs.writeFileSync(target, "untouched\n");
    expect(() => updateEnvFile({ KEY: "secret" }, options)).toThrow();
    expect(() => readEnvEntries(options.envPath)).toThrow();
    expect(fs.readFileSync(target, "utf8")).toBe("untouched\n");
    fs.unlinkSync(options.envPath);
    expect(ensureEnvFile(options)).toEqual([".env created from .env.example"]);
  });

  it("keeps pathname replacement from redirecting the update", () => {
    const options = fixture();
    ensureEnvFile(options);
    const target = join(options.root, "target");
    fs.writeFileSync(target, "untouched\n");
    const read = actualFs.readFileSync;
    vi.mocked(fs.readFileSync).mockImplementationOnce(((
      ...args: Parameters<typeof fs.readFileSync>
    ) => {
      const content = read(...args);
      fs.unlinkSync(options.envPath);
      fs.symlinkSync(target, options.envPath);
      return content;
    }) as typeof fs.readFileSync);
    updateEnvFile({ KEY: "secret" }, options);
    expect(read(target, "utf8")).toBe("untouched\n");
  });

  it("checks without mutation and handles a missing file", () => {
    const options = fixture();
    expect(ensureEnvFile({ ...options, checkOnly: true })).toEqual([
      ".env would be created from .env.example",
    ]);
    expect(updateEnvFile({ KEY: "new" }, options)).toEqual([".env is missing"]);
    ensureEnvFile(options);
    const original = fs.readFileSync(options.envPath, "utf8");
    updateEnvFile({ KEY: "new" }, { ...options, checkOnly: true });
    expect(fs.readFileSync(options.envPath, "utf8")).toBe(original);
  });

  it.skipIf(process.platform === "win32")(
    "rejects FIFO reads/checks without blocking the bootstrap process",
    () => {
      const options = fixture();
      const fifo = spawnSync("mkfifo", [options.envPath]);
      expect(fifo.status).toBe(0);
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `const { readEnvEntries, updateEnvFile } = await import(${JSON.stringify(new URL("./env-file.ts", import.meta.url).href)});
       for (const operation of [() => readEnvEntries(process.argv[1]), () => updateEnvFile({ KEY: 'synthetic' }, { envPath: process.argv[1], checkOnly: true })]) {
         let rejected = false;
         try { operation(); } catch (error) { rejected = error.message === '.env must be a regular file'; }
         if (!rejected) process.exit(1);
       }`,
          options.envPath,
        ],
        { timeout: 2_000, encoding: "utf8" },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    },
  );
});

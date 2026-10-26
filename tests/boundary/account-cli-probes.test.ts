import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  readCommandJson,
  readCommandText,
} from "../../packages/agent/src/runtime/native/account-auth/shared";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  vi.stubEnv("ELIZA_RUNTIME_MODE", "local-yolo");
  const root = mkdtempSync(join(tmpdir(), "doolittle-account-probe-"));
  roots.push(root);
  return root;
}

it("uses argv literally, the selected home and the SDK environment policy", () => {
  const home = fixture();
  vi.stubEnv(
    "NODE_OPTIONS",
    "--require=/nonexistent/doolittle-injected-module.cjs",
  );
  const literal = "$(echo should-not-run)";
  expect(
    readCommandJson(
      process.execPath,
      [
        "-e",
        "console.log(JSON.stringify({home: process.env.HOME, argument: process.argv[1], options: process.env.NODE_OPTIONS ?? null}))",
        literal,
      ],
      home,
    ),
  ).toEqual({ home, argument: literal, options: null });
});

it("caches local probes but refuses cached results after a restrictive mode change", () => {
  const home = fixture();
  const path = join(home, "invocations");
  const args = [
    "-e",
    "const fs = require('node:fs'); const p = process.argv[1]; const count = fs.existsSync(p) ? Number(fs.readFileSync(p)) + 1 : 1; fs.writeFileSync(p, String(count)); console.log(JSON.stringify({count}));",
    path,
  ];
  expect(readCommandJson(process.execPath, args, home)).toEqual({ count: 1 });
  expect(readCommandJson(process.execPath, args, home)).toEqual({ count: 1 });
  for (const mode of ["cloud", "local-safe"]) {
    vi.stubEnv("ELIZA_RUNTIME_MODE", mode);
    expect(readCommandJson(process.execPath, args, home)).toBeUndefined();
    expect(readCommandText(process.execPath, args, home)).toBe("");
  }
  expect(readFileSync(path, "utf8")).toBe("1");
});

it("retains CLI stderr diagnostics but rejects unsuccessful or malformed JSON", () => {
  const home = fixture();
  const args = [
    "-e",
    "process.stdout.write('output'); process.stderr.write('diagnostic'); process.exitCode = 2",
  ];
  expect(readCommandText(process.execPath, args, home)).toBe(
    "output\ndiagnostic",
  );
  expect(readCommandJson(process.execPath, args, home)).toBeUndefined();
  expect(
    readCommandJson(process.execPath, ["-e", "console.log('not-json')"], home),
  ).toBeUndefined();
});

it("fails closed on missing executables and excessive status output", () => {
  const home = fixture();
  expect(
    readCommandJson(join(home, "missing-command"), [], home),
  ).toBeUndefined();
  expect(
    readCommandText(
      process.execPath,
      ["-e", "process.stdout.write('x'.repeat(3 * 1024 * 1024))"],
      home,
    ),
  ).toBe("");
});

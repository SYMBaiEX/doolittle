import { spawnSync } from "node:child_process";
import * as fixtureFs from "node:fs";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HEADLESS_EVAL_SUITES, type HeadlessEvalContext } from "./cases";
import {
  fixtureScopePreserved,
  type HeadlessFixtureStrategy,
  prepareHeadlessFixture,
  readFixtureArtifact,
  runFixtureRegression,
  validateFixtureStrategy,
} from "./fixtures";

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return { ...original, readSync: vi.fn(original.readSync) };
});

const roots: string[] = [];
function directory() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-public-fixture-test-")),
  );
  chmodSync(root, 0o700);
  roots.push(root);
  return root;
}
const fixedSource =
  "import { isFiniteAmount } from './amount.mjs';\nexport function totalApproved(items) { return Math.round(items.reduce((sum, item) => item?.status === 'approved' && isFiniteAmount(item.amount) ? sum + item.amount : sum, 0) * 100) / 100; }\n";
const suite = HEADLESS_EVAL_SUITES["headless-representative-v1"];
function context(
  workspaceDir: string,
  response = "",
  actionStarts: number | null = 0,
): HeadlessEvalContext {
  return { workspaceDir, response, responses: [response], actionStarts };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("closed representative fixtures", () => {
  it.each([
    ["local-reconciliation-v1", "reconciliation.json"],
    ["local-fallback-v1", "status.json"],
  ] as const)(
    "requires private 0600 artifacts for %s and explicitly asks for that permission",
    (strategy, name) => {
      const root = directory();
      const fixture = prepareHeadlessFixture(strategy, root);
      const path = join(root, name);
      writeFileSync(path, "{}", { mode: 0o644 });
      chmodSync(path, 0o644);
      expect(fixtureScopePreserved(fixture)).toBe(false);
      expect(readFixtureArtifact(fixture)).toBeUndefined();
      chmodSync(path, 0o600);
      expect(fixtureScopePreserved(fixture)).toBe(true);
      expect(readFixtureArtifact(fixture)).toBe("{}");
      expect(
        suite.tasks.find((task) => task.fixtureStrategy === strategy)?.prompt,
      ).toContain("private owner-only regular file (permissions 0600)");
      if (strategy === "local-fallback-v1")
        expect(readFileSync(join(root, "README.md"), "utf8")).toContain(
          "permissions 0600",
        );
    },
  );
  it("rejects hardlinked artifacts without modifying their external target", () => {
    const root = directory();
    const targetRoot = directory();
    const fixture = prepareHeadlessFixture("local-fallback-v1", root);
    const target = join(targetRoot, "external-status.json");
    const contents = '{"status":"untouched"}';
    writeFileSync(target, contents, { mode: 0o600 });
    linkSync(target, join(root, "status.json"));
    expect(fixtureScopePreserved(fixture)).toBe(false);
    expect(readFixtureArtifact(fixture)).toBeUndefined();
    expect(readFileSync(target, "utf8")).toBe(contents);
  });
  it("rejects a protected seed with an external hardlink before verification", () => {
    const root = directory();
    const targetRoot = directory();
    const fixture = prepareHeadlessFixture("invoice-regression-v1", root);
    writeFileSync(join(root, "totals.mjs"), fixedSource);
    const seed = join(root, "totals.test.mjs");
    const contents = readFileSync(seed, "utf8");
    const target = join(targetRoot, "external-test.mjs");
    linkSync(seed, target);
    expect(fixtureScopePreserved(fixture)).toBe(false);
    expect(runFixtureRegression(fixture)).toBe(false);
    expect(readFileSync(target, "utf8")).toBe(contents);
    expect(readFileSync(seed, "utf8")).toBe(contents);
  });
  it("refuses FIFO substitutions without blocking during file open", () => {
    const root = directory();
    const fixture = prepareHeadlessFixture("invoice-regression-v1", root);
    const path = join(root, "totals.mjs");
    rmSync(path);
    const fifo = spawnSync("mkfifo", [path], {
      encoding: "utf8",
      timeout: 1000,
    });
    expect(fifo.status, fifo.stderr).toBe(0);
    const started = Date.now();
    expect(runFixtureRegression(fixture)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it("bounds reads and rejects a mutable artifact grown between fstat and read completion", async () => {
    const root = directory();
    const fixture = prepareHeadlessFixture("local-fallback-v1", root);
    const path = join(root, "status.json");
    writeFileSync(path, "{}", { mode: 0o600 });
    const target = lstatSync(path).ino;
    const read = (await vi.importActual<typeof import("node:fs")>("node:fs"))
      .readSync;
    let grew = false;
    vi.spyOn(fixtureFs, "readSync").mockImplementation(
      (...args: Parameters<typeof read>) => {
        const count = Reflect.apply(read, fixtureFs, args) as number;
        if (!grew && fixtureFs.fstatSync(args[0]).ino === target) {
          grew = true;
          fixtureFs.appendFileSync(path, "x".repeat(65_537));
        }
        return count;
      },
    );
    expect(readFixtureArtifact(fixture)).toBeUndefined();
    expect(grew).toBe(true);
  });
  it("refuses owner mismatch and nonprivate file permissions", () => {
    const root = directory();
    const fixture = prepareHeadlessFixture("invoice-regression-v1", root);
    chmodSync(join(root, "totals.mjs"), 0o644);
    expect(fixtureScopePreserved(fixture)).toBe(false);
    const owner = process.getuid?.();
    if (owner === undefined) throw new Error("Expected supported fixture OS");
    vi.spyOn(process, "getuid").mockReturnValue(owner + 1);
    expect(() =>
      prepareHeadlessFixture("local-fallback-v1", directory()),
    ).toThrow("Unsafe headless fixture root");
  });
  it("has five human-reviewed tasks, seven turns, eighteen checks and the unchanged SDK task", () => {
    expect(suite.id).toBe("headless-representative");
    expect(suite.version).toBe(1);
    expect(suite.tasks).toHaveLength(5);
    expect(
      suite.tasks.reduce(
        (sum, task) => sum + 1 + (task.followUpPrompts?.length ?? 0),
        0,
      ),
    ).toBe(7);
    expect(suite.tasks.reduce((sum, task) => sum + task.checks.length, 0)).toBe(
      18,
    );
    expect(suite.tasks.every((task) => task.humanReviewRequired)).toBe(true);
    expect(suite.tasks[4]).toBe(
      HEADLESS_EVAL_SUITES["headless-sdk-web-research-v1"].tasks[0],
    );
  });
  it.each([
    "invoice-regression-v1",
    "local-reconciliation-v1",
    "local-fallback-v1",
  ] as HeadlessFixtureStrategy[])(
    "creates exclusive private regular files for %s",
    (strategy) => {
      const root = directory();
      const fixture = prepareHeadlessFixture(strategy, root);
      expect(fixtureScopePreserved(fixture)).toBe(true);
      for (const name of readdirSync(root)) {
        const stat = lstatSync(join(root, name));
        expect(stat.isFile()).toBe(true);
        expect(stat.nlink).toBe(1);
        expect(stat.mode & 0o077).toBe(0);
      }
      expect(() => prepareHeadlessFixture(strategy, root)).toThrow(
        "fresh private workspace",
      );
    },
  );
  it("rejects unknown strategies before creating any files and rejects forged handles", () => {
    const root = directory();
    expect(() =>
      prepareHeadlessFixture(
        "incoming-file-content" as HeadlessFixtureStrategy,
        root,
      ),
    ).toThrow("Unknown headless fixture strategy");
    expect(() =>
      validateFixtureStrategy({ path: "arbitrary", content: "arbitrary" }),
    ).toThrow();
    expect(readdirSync(root)).toEqual([]);
    expect(fixtureScopePreserved({ strategy: "invoice-regression-v1" })).toBe(
      false,
    );
  });
  it("refuses nonprivate and symlink workspaces without touching the target", () => {
    const parent = directory();
    const target = directory();
    const link = join(parent, "workspace");
    symlinkSync(target, link);
    expect(() => prepareHeadlessFixture("local-fallback-v1", link)).toThrow(
      "Unsafe headless fixture root",
    );
    expect(readdirSync(target)).toEqual([]);
    chmodSync(target, 0o755);
    expect(() => prepareHeadlessFixture("local-fallback-v1", target)).toThrow(
      "Unsafe headless fixture root",
    );
  });
  it("executes the preserved behavioral tests, not a response's test claim", () => {
    const root = directory();
    const fixture = prepareHeadlessFixture("invoice-regression-v1", root);
    expect(runFixtureRegression(fixture)).toBe(false);
    writeFileSync(join(root, "totals.mjs"), fixedSource);
    expect(runFixtureRegression(fixture)).toBe(true);
    const task = suite.tasks[1];
    expect(
      task.checks[2].evaluate({
        ...context(root, '{"file":"totals.mjs","agentVerification":"passed"}'),
        fixture,
      }),
    ).toBe(false);
    expect(
      task.checks[2].evaluate({
        ...context(
          root,
          '{"file":"totals.mjs","agentVerification":"UNATTESTED","summary":"Filter approved numeric amounts using the helper and round only the final sum.","limitations":"The harness, not this response, supplies independent behavior checks."}',
        ),
        fixture,
      }),
    ).toBe(true);
    for (const wrong of [
      {
        file: "totals.mjs",
        agentVerification: "UNATTESTED",
        summary: "",
        limitations: "Not attested",
      },
      {
        file: "totals.mjs",
        agentVerification: "UNATTESTED",
        summary: "fixed",
        limitations: " ".repeat(4),
      },
      {
        file: "totals.mjs",
        agentVerification: "UNATTESTED",
        summary: "x".repeat(501),
        limitations: "Not attested",
      },
      {
        file: "totals.mjs",
        agentVerification: "UNATTESTED",
        summary: "fixed",
        limitations: "Not attested",
        passed: true,
      },
    ])
      expect(
        task.checks[2].evaluate({
          ...context(root, JSON.stringify(wrong)),
          fixture,
        }),
      ).toBe(false);
  });
  it("runs the same trusted Node verifier under the actual Nub runtime", () => {
    const root = directory();
    const module = new URL("./fixtures.ts", import.meta.url).href;
    const script = `import { prepareHeadlessFixture, runFixtureRegression } from ${JSON.stringify(module)}; import { writeFileSync } from 'node:fs'; const fixture = prepareHeadlessFixture('invoice-regression-v1', ${JSON.stringify(root)}); writeFileSync(${JSON.stringify(join(root, "totals.mjs"))}, ${JSON.stringify(fixedSource)}); process.stdout.write(JSON.stringify({ passed: runFixtureRegression(fixture), runtime: process.versions.bun ? 'bun' : 'node' }));`;
    const result = spawnSync("nub", ["-e", script], {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 65_536,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).passed).toBe(true);
    expect(["node", "bun"]).toContain(JSON.parse(result.stdout).runtime);
  });
  it.each([
    "totals.test.mjs",
    "amount.mjs",
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
  ])("refuses altered protected %s before executing it", (name) => {
    const root = directory();
    const fixture = prepareHeadlessFixture("invoice-regression-v1", root);
    const sentinel = join(directory(), "grader-executed");
    writeFileSync(join(root, "totals.mjs"), fixedSource);
    writeFileSync(
      join(root, name),
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinel)}, 'attacker grader ran');`,
    );
    expect(fixtureScopePreserved(fixture)).toBe(false);
    expect(runFixtureRegression(fixture)).toBe(false);
    expect(existsSync(sentinel)).toBe(false);
  });
  it.each(["totals.mjs", "totals.test.mjs", "amount.mjs"])(
    "refuses symlink substitutions for %s without executing foreign content",
    (name) => {
      const root = directory();
      const fixture = prepareHeadlessFixture("invoice-regression-v1", root);
      const target = join(directory(), "foreign.mjs");
      writeFileSync(target, fixedSource);
      rmSync(join(root, name));
      symlinkSync(target, join(root, name));
      expect(fixtureScopePreserved(fixture)).toBe(false);
      expect(runFixtureRegression(fixture)).toBe(false);
      expect(readFileSync(target, "utf8")).toBe(fixedSource);
    },
  );
  it("rejects an identical-content replacement of a pinned helper and any extra files", () => {
    const root = directory();
    const fixture = prepareHeadlessFixture("invoice-regression-v1", root);
    const path = join(root, "amount.mjs");
    const original = readFileSync(path);
    rmSync(path);
    writeFileSync(path, original);
    expect(fixtureScopePreserved(fixture)).toBe(false);
    const other = directory();
    const otherFixture = prepareHeadlessFixture("local-fallback-v1", other);
    writeFileSync(join(other, "primary-status.json"), "{}");
    expect(fixtureScopePreserved(otherFixture)).toBe(false);
  });
  it.each([
    "import fs from 'node:fs'; fs.writeFileSync('README.md', 'changed'); export function totalApproved() { return 0; }",
    "await import('node:fs'); export function totalApproved() { return 0; }",
    "globalThis.constructor.constructor('return process')(); export function totalApproved() { return 0; }",
    "try { await import('node:fs'); } catch (error) { const host = error.constructor.constructor('return process')(); host.stdout.write('fixture-regression:passed\\n'); host.exit(0); } export function totalApproved() { return 0; }",
  ])(
    "rejects external imports or code-generation escape attempts",
    (source) => {
      const root = directory();
      const fixture = prepareHeadlessFixture("invoice-regression-v1", root);
      const before = readFileSync(join(root, "README.md"), "utf8");
      writeFileSync(join(root, "totals.mjs"), source);
      expect(runFixtureRegression(fixture)).toBe(false);
      expect(readFileSync(join(root, "README.md"), "utf8")).toBe(before);
      expect(fixtureScopePreserved(fixture)).toBe(true);
    },
  );
  it("fails closed on oversized mutable source and bounds a nonterminating verifier", () => {
    const root = directory();
    const fixture = prepareHeadlessFixture("invoice-regression-v1", root);
    writeFileSync(join(root, "totals.mjs"), " ".repeat(65_537));
    expect(runFixtureRegression(fixture)).toBe(false);
    writeFileSync(
      join(root, "totals.mjs"),
      "export function totalApproved() { while (true) {} }",
    );
    expect(runFixtureRegression(fixture)).toBe(false);
  });
  it("requires all handoff responses, corrected facts, observable constraints, and available zero-action telemetry", () => {
    const task = suite.tasks[0];
    const response = JSON.stringify({
      project: "Harbor",
      owner: "Jules",
      releaseDay: "Thursday",
      maxP95Ms: 75,
      addDependencies: false,
      implementationRequested: false,
      externalMessagesRequested: false,
      rollbackTrigger: "duplicate charge",
      releaseTimezone: null,
      rollbackOwner: null,
    });
    const valid = {
      ...context(directory(), response),
      responses: ["Summary", "Correction retained", response],
    };
    expect(task.checks.every((check) => check.evaluate(valid))).toBe(true);
    expect(task.checks[0].evaluate({ ...valid, responses: [response] })).toBe(
      false,
    );
    expect(
      task.checks[1].evaluate({
        ...valid,
        response: response.replace('"Jules"', '"Maya"'),
      }),
    ).toBe(false);
    expect(
      task.checks[1].evaluate({
        ...valid,
        response: JSON.stringify({
          ...JSON.parse(response),
          releaseTimezone: "UTC",
        }),
      }),
    ).toBe(false);
    expect(task.checks[2].evaluate({ ...valid, actionStarts: null })).toBe(
      false,
    );
    expect(task.checks[2].evaluate({ ...valid, actionStarts: 1 })).toBe(false);
  });
  it("grades exact local citations and unavailable facts without asserting read actions", () => {
    const root = directory();
    const fixture = prepareHeadlessFixture("local-reconciliation-v1", root);
    const task = suite.tasks[2];
    const report = {
      capacity: 40,
      launchRequiresSafetyReview: true,
      pilotStartDate: null,
      authority: "launch-policy.md",
      authorityDate: "2026-09-12",
      conflictingSource: "planning-note.md",
      conflictingDate: "2026-10-01",
      citations: [
        { file: "launch-policy.md", quote: "Pilot capacity is 40 accounts." },
        {
          file: "launch-policy.md",
          quote: "Pilot runs stay disabled until safety review approves.",
        },
        {
          file: "planning-note.md",
          quote:
            "We propose 80 pilot accounts and launch before safety review.",
        },
      ],
      unavailableFact: "pilot start date",
    };
    writeFileSync(join(root, "reconciliation.json"), JSON.stringify(report), {
      mode: 0o600,
    });
    expect(task.checks[1].evaluate({ ...context(root), fixture })).toBe(true);
    expect(readFixtureArtifact(fixture)).toBe(JSON.stringify(report));
    const final = JSON.stringify({ ...report, readProof: "UNATTESTED" });
    expect(task.checks[2].evaluate({ ...context(root, final), fixture })).toBe(
      true,
    );
    expect(
      task.checks[2].evaluate({
        ...context(
          root,
          '{"artifact":"reconciliation.json","readProof":"UNATTESTED"}',
        ),
        fixture,
      }),
    ).toBe(false);
    for (const wrong of [
      { ...report, capacity: 80 },
      { ...report, pilotStartDate: "2026-10-05" },
      {
        ...report,
        citations: [
          { file: "planning-note.md", quote: "Pilot capacity is 40 accounts." },
        ],
      },
      { ...report, readProved: true },
    ]) {
      writeFileSync(join(root, "reconciliation.json"), JSON.stringify(wrong), {
        mode: 0o600,
      });
      expect(task.checks[1].evaluate({ ...context(root), fixture })).toBe(
        false,
      );
      expect(
        task.checks[2].evaluate({ ...context(root, final), fixture }),
      ).toBe(false);
    }
  });
  it("grades fallback artifact plus recorded-action presence only, rejecting missing telemetry and symlink artifacts", () => {
    const root = directory();
    const fixture = prepareHeadlessFixture("local-fallback-v1", root);
    const task = suite.tasks[3];
    const artifact = join(root, "status.json");
    writeFileSync(
      artifact,
      JSON.stringify({
        primary: "unavailable",
        source: "fallback-status.json",
        service: "Harbor",
        status: "degraded",
        reason: "maintenance",
        externalEffects: "not-requested",
      }),
      { mode: 0o600 },
    );
    const valid = {
      ...context(
        root,
        '{"primary":"unavailable","source":"fallback-status.json","service":"Harbor","status":"degraded","reason":"maintenance","externalEffects":"not-requested","artifact":"status.json"}',
        1,
      ),
      fixture,
    };
    expect(task.checks.every((check) => check.evaluate(valid))).toBe(true);
    expect(task.checks[2].evaluate({ ...valid, actionStarts: null })).toBe(
      false,
    );
    expect(task.checks[2].evaluate({ ...valid, actionStarts: 0 })).toBe(false);
    const target = join(directory(), "artifact.json");
    writeFileSync(target, readFileSync(artifact));
    rmSync(artifact);
    symlinkSync(target, artifact);
    expect(task.checks[0].evaluate(valid)).toBe(false);
    expect(task.checks[1].evaluate(valid)).toBe(false);
  });
});

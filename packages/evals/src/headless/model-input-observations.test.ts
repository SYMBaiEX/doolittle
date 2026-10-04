import { createHash } from "node:crypto";
import * as fs from "node:fs";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEvalModelInputObservationsPlugin } from "@doolittle/agent/runtime/native/plugin-registry/eval-model-input-observations";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MODEL_INPUT_BYTE_LIMIT,
  MODEL_INPUT_FILE,
  MODEL_INPUT_ROW_LIMIT,
  pinModelInputDataRoot,
  readModelInputObservations,
} from "./model-input-observations";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    openSync: vi.fn(actual.openSync),
    closeSync: vi.fn(actual.closeSync),
    lstatSync: vi.fn(actual.lstatSync),
    fstatSync: vi.fn(actual.fstatSync),
    readSync: vi.fn(actual.readSync),
  };
});

const roots: string[] = [];
const canary = "PRIVATE_PROMPT_SCHEMA_ERROR_PATH_LABEL_TOKEN_ID_CANARY";
function directory() {
  const path = mkdtempSync(
    join(realpathSync(tmpdir()), "headless-model-input-test-"),
  );
  roots.push(path);
  return path;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const path of roots.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function input(ordinal = 1) {
  return {
    version: 1,
    phase: "unknown",
    priorSinkMs: 0,
    kind: "input",
    ordinal,
    slot: "TEXT_LARGE",
    requestedSlot: "TEXT_LARGE",
    provider: "codex",
    systemChars: 10,
    promptChars: 20,
    messageTextChars: null,
    messageCount: null,
    imageCount: null,
    toolCount: null,
    toolSchemaChars: null,
    requestedStreaming: true,
    partial: false,
    projectionMs: 0.1,
  };
}
function settlement(ordinal: number | null = 1) {
  return {
    version: 1,
    phase: "unknown",
    priorSinkMs: 1,
    kind: "settlement",
    ordinal,
    association: ordinal === null ? "unavailable" : "same-params-object",
    consumedStreaming: true,
  };
}
function nativeInput(ordinal = 1) {
  return {
    ...input(ordinal),
    version: 2,
    messageCount: 2,
    messageTextChars: 10,
    imageCount: 0,
    toolCallArgumentChars: 20,
    toolResultTextChars: 100_000,
  };
}
function usage(ordinal: number | null = 1) {
  return {
    version: 1,
    phase: "unknown",
    priorSinkMs: 0.5,
    kind: "provider-usage",
    ordinal,
    association: ordinal === null ? "unavailable" : "same-params-object",
    completed: true,
    inputTokens: 30,
    outputTokens: null,
    totalTokens: null,
  };
}
function write(path: string, rows: unknown[]) {
  const bytes = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  writeFileSync(join(path, MODEL_INPUT_FILE), bytes, {
    mode: 0o600,
    flag: "wx",
  });
  return bytes;
}
describe("bounded private model-input projection", () => {
  it("retains closed native size version2 rows alongside unchanged legacy version1 rows", () => {
    const path = directory();
    const identity = pinModelInputDataRoot(path);
    const rows = [
      input(),
      usage(),
      settlement(),
      nativeInput(2),
      { ...usage(2), version: 2 },
      { ...settlement(2), version: 2 },
    ];
    write(path, rows);
    expect(readModelInputObservations(identity)).toMatchObject({
      status: "complete",
      rejectedRows: 0,
      rows,
    });
  });

  it.each([
    { toolCallArgumentChars: -1 },
    { toolCallArgumentChars: 65_537 },
    { toolResultTextChars: 1.5 },
    { toolResultTextChars: "PRIVATE_CANARY" },
    { toolResultTextChars: Number.MAX_SAFE_INTEGER + 1 },
    { version: 3 },
    { extra: canary },
  ])("rejects unbounded or unknown native size fields: %#", (patch) => {
    const path = directory();
    const identity = pinModelInputDataRoot(path);
    write(path, [{ ...nativeInput(), ...patch }]);
    const output = readModelInputObservations(identity);
    expect(output).toMatchObject({
      status: "partial",
      rejectedRows: 1,
      rows: [],
    });
    expect(JSON.stringify(output)).not.toContain(canary);
    expect(JSON.stringify(output)).not.toContain("PRIVATE_CANARY");
  });

  it("keeps native null sizes unavailable and rejects cross-version identity joins", () => {
    const path = directory();
    const identity = pinModelInputDataRoot(path);
    const row = {
      ...nativeInput(),
      messageTextChars: null,
      toolCallArgumentChars: null,
      toolResultTextChars: null,
      partial: true,
    };
    const matchedUsage = { ...usage(), version: 2 };
    const matchedSettlement = { ...settlement(), version: 2 };
    write(path, [row, usage(), matchedUsage, settlement(), matchedSettlement]);
    expect(readModelInputObservations(identity)).toMatchObject({
      status: "partial",
      rejectedRows: 2,
      rows: [row, matchedUsage, matchedSettlement],
    });
  });

  it("does not accept native fields added to a legacy row", () => {
    const path = directory();
    const identity = pinModelInputDataRoot(path);
    write(path, [
      { ...input(), toolCallArgumentChars: 0, toolResultTextChars: 0 },
    ]);
    expect(readModelInputObservations(identity)).toMatchObject({
      rejectedRows: 1,
      rows: [],
    });
  });

  it("retains exact closed rows, nullable observations and full bounded source SHA", () => {
    const path = directory();
    const identity = pinModelInputDataRoot(path);
    const bytes = write(path, [
      input(),
      usage(),
      settlement(),
      settlement(null),
      usage(null),
    ]);
    const output = readModelInputObservations(identity);
    expect(output).toMatchObject({
      status: "complete",
      scannedRows: 5,
      rejectedRows: 0,
      coverage: "first-creating-runtime-only",
      sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(output.rows).toEqual([
      input(),
      usage(),
      settlement(),
      settlement(null),
      usage(null),
    ]);
    expect(JSON.stringify(output)).not.toContain(path);
  });
  it("accepts rows emitted by the actual plugin and exclusive private sink without raw input content", async () => {
    const path = directory();
    const identity = pinModelInputDataRoot(path);
    vi.stubEnv("DOOLITTLE_DATA_DIR", path);
    const hooks = new Map<
      string,
      (runtime: unknown, context: unknown) => unknown
    >();
    const runtime = {
      unregisterPipelineHook: () => {},
      registerPipelineHook: (hook: {
        phase: string;
        handler: (runtime: unknown, context: unknown) => unknown;
      }) => hooks.set(hook.phase, hook.handler),
    };
    try {
      const plugin = createEvalModelInputObservationsPlugin({ enabled: true });
      await plugin.init?.({}, runtime as never);
      const params = {
        system: canary,
        prompt: canary,
        stream: true,
        tools: [{ parameters: { type: "object", description: canary } }],
      };
      hooks.get("pre_model")?.(runtime, {
        phase: "pre_model",
        params,
        resolvedModelKey: "TEXT_LARGE",
        requestedModelType: "TEXT_LARGE",
        provider: "codex",
      });
      hooks.get("post_model")?.(runtime, {
        phase: "post_model",
        params,
        streaming: true,
      });
      const output = readModelInputObservations(identity);
      expect(output.status).toBe("complete");
      expect(output.rows).toHaveLength(2);
      expect(output.rows[0]).toMatchObject({
        kind: "input",
        promptChars: canary.length,
        systemChars: canary.length,
        toolCount: 1,
      });
      expect(output.rows[1]).toMatchObject({
        kind: "settlement",
        association: "same-params-object",
        ordinal: 1,
      });
      expect(JSON.stringify(output)).not.toContain(canary);
      expect(readFileSync(join(path, MODEL_INPUT_FILE), "utf8")).not.toContain(
        canary,
      );
      const originalBytes = readFileSync(join(path, MODEL_INPUT_FILE), "utf8");
      const laterRuntime = { ...runtime };
      await createEvalModelInputObservationsPlugin({ enabled: true }).init?.(
        {},
        laterRuntime as never,
      );
      hooks.get("pre_model")?.(laterRuntime, {
        phase: "pre_model",
        params: { prompt: canary },
        resolvedModelKey: "TEXT_LARGE",
        requestedModelType: "TEXT_LARGE",
        provider: "codex",
      });
      expect(readFileSync(join(path, MODEL_INPUT_FILE), "utf8")).toBe(
        originalBytes,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.each([
    { extra: canary },
    { phase: "planner" },
    { version: 2 },
    { provider: canary },
    { slot: canary },
    { systemChars: -1 },
    { promptChars: 1.5 },
    { messageCount: 65 },
    { imageCount: 4097 },
    { toolSchemaChars: 65537 },
    { projectionMs: null },
    { requestedStreaming: canary },
    { partial: null },
    { ordinal: 513 },
    { ordinal: 0 },
    { toolCount: { raw: canary } },
  ])(
    "rejects malformed, unknown or unbounded input fields without copying them: %#",
    (patch) => {
      const path = directory();
      const identity = pinModelInputDataRoot(path);
      write(path, [{ ...input(), ...patch }]);
      const output = readModelInputObservations(identity);
      expect(output).toMatchObject({
        status: "partial",
        rejectedRows: 1,
        rows: [],
      });
      expect(JSON.stringify(output)).not.toContain(canary);
    },
  );
  it("rejects impossible joins, duplicate associations and unknown usage keys", () => {
    const path = directory();
    const identity = pinModelInputDataRoot(path);
    write(path, [
      usage(),
      input(),
      input(),
      { ...usage(), ordinal: null },
      usage(),
      usage(),
      settlement(),
      settlement(),
      usage(),
      { ...usage(null), tokenId: canary },
      { ...settlement(null), association: "same-params-object" },
    ]);
    const output = readModelInputObservations(identity);
    expect(output.rows).toEqual([input(), usage(), settlement()]);
    expect(output.rejectedRows).toBe(8);
    expect(JSON.stringify(output)).not.toContain(canary);
  });
  it.each(["row", "rows", "bytes", "malformed", "blank-lines", "unterminated"])(
    "bounds %s evidence without leaking rejected bytes",
    (kind) => {
      const path = directory();
      const identity = pinModelInputDataRoot(path);
      const line = `${JSON.stringify(settlement(null))}\n`;
      const bytes =
        kind === "row"
          ? `${JSON.stringify({ extra: canary.repeat(100) })}\n${line}`
          : kind === "rows"
            ? line.repeat(MODEL_INPUT_ROW_LIMIT + 1)
            : kind === "bytes"
              ? line + " ".repeat(MODEL_INPUT_BYTE_LIMIT)
              : kind === "blank-lines"
                ? line + "\n".repeat(MODEL_INPUT_ROW_LIMIT + 1)
                : kind === "unterminated"
                  ? line + JSON.stringify(input())
                  : `{${canary}\n${line}`;
      writeFileSync(join(path, MODEL_INPUT_FILE), bytes, { mode: 0o600 });
      const output = readModelInputObservations(identity);
      expect(output.status).toBe("partial");
      expect(output.bytesRead).toBeLessThanOrEqual(MODEL_INPUT_BYTE_LIMIT);
      expect(output.scannedRows).toBeLessThanOrEqual(MODEL_INPUT_ROW_LIMIT);
      expect(output.rows.length).toBeGreaterThan(0);
      if (kind === "bytes") expect(output.sourceSha256).toBeNull();
      expect(JSON.stringify(output)).not.toContain(canary);
    },
  );
  it("does not imply complete observation coverage from an empty created file", () => {
    const path = directory();
    const identity = pinModelInputDataRoot(path);
    writeFileSync(join(path, MODEL_INPUT_FILE), "", { mode: 0o600 });
    expect(readModelInputObservations(identity)).toMatchObject({
      status: "unavailable",
      rows: [],
    });
  });
  it.each([
    "missing",
    "symlink",
    "hardlink",
    "directory",
    "file-mode",
    "root-mode",
    "alias",
    "replacement",
  ])("refuses %s without adopting unowned state", (kind) => {
    const parent = directory();
    const path = join(parent, "data");
    mkdirSync(path, { mode: 0o700 });
    let identity = pinModelInputDataRoot(path);
    const leaf = join(path, MODEL_INPUT_FILE);
    const other = join(parent, "other");
    writeFileSync(other, canary, { mode: 0o600 });
    if (kind === "symlink") symlinkSync(other, leaf);
    else if (kind === "hardlink") linkSync(other, leaf);
    else if (kind === "directory") mkdirSync(leaf);
    else if (kind !== "missing") write(path, [input()]);
    if (kind === "file-mode") chmodSync(leaf, 0o644);
    if (kind === "root-mode") chmodSync(path, 0o755);
    if (kind === "alias") {
      symlinkSync(path, join(parent, "alias"));
      identity = pinModelInputDataRoot(join(parent, "alias"));
    }
    if (kind === "replacement") {
      renameSync(path, join(parent, "original"));
      mkdirSync(path, { mode: 0o700 });
      write(path, [input()]);
    }
    const output = readModelInputObservations(identity);
    expect(output).toMatchObject({
      status: "unavailable",
      sourceSha256: null,
      rows: [],
    });
    expect(readFileSync(other, "utf8")).toBe(canary);
  });
  it("refuses a pathname replaced after opening its original descriptor, before reading any bytes", async () => {
    const path = directory();
    const identity = pinModelInputDataRoot(path);
    write(path, [input()]);
    const originalOpen = (
      await vi.importActual<typeof import("node:fs")>("node:fs")
    ).openSync;
    const open = vi
      .spyOn(fs, "openSync")
      .mockClear()
      .mockImplementationOnce((...args: Parameters<typeof fs.openSync>) => {
        const fd = originalOpen(...args);
        renameSync(join(path, MODEL_INPUT_FILE), join(path, "original"));
        writeFileSync(join(path, MODEL_INPUT_FILE), canary, {
          mode: 0o600,
          flag: "wx",
        });
        return fd;
      });
    const close = vi.spyOn(fs, "closeSync").mockClear();
    const read = vi.spyOn(fs, "readSync").mockClear();
    expect(readModelInputObservations(identity)).toMatchObject({
      status: "unavailable",
      bytesRead: 0,
      rows: [],
    });
    expect(open).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    expect(readFileSync(join(path, MODEL_INPUT_FILE), "utf8")).toBe(canary);
  });
  it.each(["mode", "owner"])(
    "refuses post-open mismatched named-leaf %s before reading and closes its FD",
    async (kind) => {
      const path = directory();
      const identity = pinModelInputDataRoot(path);
      write(path, [input()]);
      const originalLstat = (
        await vi.importActual<typeof import("node:fs")>("node:fs")
      ).lstatSync;
      vi.spyOn(fs, "lstatSync").mockImplementation(
        (...args: Parameters<typeof fs.lstatSync>) => {
          if (args[0] === join(path, MODEL_INPUT_FILE) && kind === "mode")
            chmodSync(join(path, MODEL_INPUT_FILE), 0o644);
          const stat = originalLstat(...args);
          if (args[0] === join(path, MODEL_INPUT_FILE) && kind === "owner")
            return Object.assign(
              Object.create(Object.getPrototypeOf(stat)),
              stat,
              { uid: BigInt(process.getuid?.() ?? 0) + 1n },
            );
          return stat;
        },
      );
      const read = vi.spyOn(fs, "readSync").mockClear();
      const close = vi.spyOn(fs, "closeSync").mockClear();
      expect(readModelInputObservations(identity)).toMatchObject({
        status: "unavailable",
        bytesRead: 0,
        rows: [],
      });
      expect(read).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
    },
  );
  it("opens nonblocking/no-follow and refuses a nonregular descriptor before a stream read", async () => {
    const path = directory();
    const identity = pinModelInputDataRoot(path);
    write(path, [input()]);
    const originalStat = (
      await vi.importActual<typeof import("node:fs")>("node:fs")
    ).fstatSync;
    vi.spyOn(fs, "fstatSync").mockImplementationOnce(
      (...args: Parameters<typeof fs.fstatSync>) => {
        const stat = originalStat(...args);
        return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
          isFile: () => false,
          isFIFO: () => true,
        });
      },
    );
    const open = vi.spyOn(fs, "openSync").mockClear();
    const read = vi.spyOn(fs, "readSync").mockClear();
    const close = vi.spyOn(fs, "closeSync").mockClear();
    expect(readModelInputObservations(identity)).toMatchObject({
      status: "unavailable",
      bytesRead: 0,
      rows: [],
    });
    expect(open).toHaveBeenCalledWith(
      join(path, MODEL_INPUT_FILE),
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW,
    );
    expect(read).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});

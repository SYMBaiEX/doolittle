import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import type { AppLogger } from "@/logging/logger";

type StartupModule = typeof import("./startup");

type StartupMockOptions = {
  envFileContent?: string;
  existsSync?: (path: string) => boolean | undefined;
  spawnStatus?: number | null;
};

const logLines: string[] = [];
const errorLines: string[] = [];

const logger: AppLogger = {
  name: "test",
  scope: "test.startup",
  isLevelEnabled: mock(() => true),
  log: mock(() => {}),
  trace: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  fatal: mock(() => {}),
  recordCrash: mock(() => {}),
  captureError: mock((label: string) => label),
  flush: mock(async () => {}),
  close: mock(async () => {}),
  withFields: () => logger,
  withTags: () => logger,
  child: () => logger,
  getEventLogPath: () => "",
  getCrashLogPath: () => "",
};

const realExistsSync = fs.existsSync;
const realMkdirSync = fs.mkdirSync;
const realReadFileSync = fs.readFileSync;
const realSpawnSync = childProcess.spawnSync;

let stdinTtyDescriptor: PropertyDescriptor | undefined;
let stdoutTtyDescriptor: PropertyDescriptor | undefined;
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;
let originalProcessExit: typeof process.exit;

function setTty(interactive: boolean) {
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: interactive,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: interactive,
  });
}

function installStartupMocks(options: StartupMockOptions = {}) {
  const existsSync = mock((path: string) => {
    if (options.existsSync) {
      const overridden = options.existsSync(path);
      if (overridden !== undefined) {
        return overridden;
      }
    }
    return realExistsSync(path);
  });
  const mkdirSync = mock((...args: Parameters<typeof fs.mkdirSync>) =>
    realMkdirSync(...args),
  );
  const readFileSync = mock((...args: Parameters<typeof fs.readFileSync>) =>
    String(args[0]).endsWith(".env") && options.envFileContent !== undefined
      ? options.envFileContent
      : realReadFileSync(...args),
  );
  const spawnSync = mock(
    (...args: Parameters<typeof childProcess.spawnSync>) =>
      args[0] === "bun" &&
      Array.isArray(args[1]) &&
      args[1].some((part) => String(part).endsWith("scripts/bootstrap.ts"))
        ? ({ status: options.spawnStatus ?? 0 } as ReturnType<
            typeof childProcess.spawnSync
          >)
        : realSpawnSync(...args),
  );

  mock.module("node:fs", () => ({
    ...fs,
    existsSync,
    mkdirSync,
    readFileSync,
  }));
  mock.module("node:child_process", () => ({
    ...childProcess,
    spawnSync,
  }));
  mock.module("@/logging/entrypoint-logger", () => ({
    getEntrypointLogger: () => logger,
  }));

  console.log = ((...parts: unknown[]) => {
    logLines.push(parts.join(" "));
  }) as typeof console.log;
  console.error = ((...parts: unknown[]) => {
    errorLines.push(parts.join(" "));
  }) as typeof console.error;
  process.exit = ((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }) as never;

  return {
    existsSync,
    mkdirSync,
    readFileSync,
    spawnSync,
  };
}

async function loadStartupModule(): Promise<StartupModule> {
  return import(`./startup?startup-test=${Date.now()}-${Math.random()}`);
}

describe("cli startup", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
    logLines.length = 0;
    errorLines.length = 0;
    stdinTtyDescriptor = Object.getOwnPropertyDescriptor(
      process.stdin,
      "isTTY",
    );
    stdoutTtyDescriptor = Object.getOwnPropertyDescriptor(
      process.stdout,
      "isTTY",
    );
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalProcessExit = process.exit;
    setTty(true);
    delete process.env.PGLITE_DATA_DIR;
    delete process.env.LOG_LEVEL;
    delete process.env.DEFAULT_LOG_LEVEL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
    if (stdinTtyDescriptor) {
      Object.defineProperty(process.stdin, "isTTY", stdinTtyDescriptor);
    }
    if (stdoutTtyDescriptor) {
      Object.defineProperty(process.stdout, "isTTY", stdoutTtyDescriptor);
    }
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
    delete process.env.PGLITE_DATA_DIR;
    delete process.env.LOG_LEVEL;
    delete process.env.DEFAULT_LOG_LEVEL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
  });

  it("loads local runtime env defaults and clears stale database vars when .env omits them", async () => {
    const fs = installStartupMocks({
      existsSync: (path) => (path.endsWith(".env") ? true : undefined),
      envFileContent: "LOG_LEVEL=info\n",
    });
    process.env.DATABASE_URL = "postgres://stale";
    process.env.POSTGRES_URL = "postgres://stale";

    const { loadLocalRuntimeEnv } = await loadStartupModule();
    loadLocalRuntimeEnv();

    expect(process.env.PGLITE_DATA_DIR).toContain(".doolittle/pglite");
    expect(process.env.LOG_LEVEL).toBe("error");
    expect(process.env.DEFAULT_LOG_LEVEL).toBe("error");
    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(process.env.POSTGRES_URL).toBeUndefined();
    expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
  });

  it("preserves explicit database vars when .env declares a database url", async () => {
    installStartupMocks({
      existsSync: (path) => (path.endsWith(".env") ? true : undefined),
      envFileContent: "DATABASE_URL=postgres://configured\n",
    });
    process.env.DATABASE_URL = "postgres://configured";
    process.env.POSTGRES_URL = "postgres://configured";

    const { loadLocalRuntimeEnv } = await loadStartupModule();
    loadLocalRuntimeEnv();

    expect(process.env.DATABASE_URL).toBe("postgres://configured");
    expect(process.env.POSTGRES_URL).toBe("postgres://configured");
  });

  it("exits when onboarding bootstrap script is missing", async () => {
    installStartupMocks({
      existsSync: (path) =>
        path.endsWith("scripts/bootstrap.ts") ? false : undefined,
    });

    const { runOnboardingWizard } = await loadStartupModule();

    await expect(runOnboardingWizard()).rejects.toThrow(
      "CLI startup requested exit 1",
    );
    expect(
      errorLines.some((line) => line.includes("Onboarding script not found")),
    ).toBe(true);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("propagates non-zero onboarding wizard exits", async () => {
    const fs = installStartupMocks({
      existsSync: (path) =>
        path.endsWith("scripts/bootstrap.ts") ? true : undefined,
      spawnStatus: 7,
    });

    const { runOnboardingWizard } = await loadStartupModule();

    await expect(runOnboardingWizard(["--check"])).rejects.toThrow(
      "CLI startup requested exit 7",
    );
    expect(fs.spawnSync).toHaveBeenCalledWith(
      "bun",
      expect.any(Array),
      expect.objectContaining({ stdio: "inherit" }),
    );
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("runs onboarding interactively when onboarding is missing", async () => {
    const fs = installStartupMocks({
      existsSync: (path) =>
        path.endsWith("onboarding.json")
          ? false
          : path.endsWith("scripts/bootstrap.ts")
            ? true
            : undefined,
      spawnStatus: 0,
    });
    setTty(true);

    const { ensureOnboarded } = await loadStartupModule();
    await ensureOnboarded();

    expect(
      logLines.some((line) => line.includes("Beginning first contact")),
    ).toBe(true);
    expect(fs.spawnSync).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it("exits with guidance when onboarding is missing in non-interactive mode", async () => {
    installStartupMocks({
      existsSync: (path) =>
        path.endsWith("onboarding.json") ? false : undefined,
    });
    setTty(false);

    const { ensureOnboarded } = await loadStartupModule();

    await expect(ensureOnboarded()).rejects.toThrow(
      "CLI startup requested exit 1",
    );
    expect(
      errorLines.some((line) => line.includes("Run 'doolittle setup'")),
    ).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

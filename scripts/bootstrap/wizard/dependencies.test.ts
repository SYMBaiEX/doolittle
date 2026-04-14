import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth/types";
import type { BootstrapWizardContext } from "../bootstrap-context";
import type { BootstrapDependencyProbe } from "../types";
import type { WizardScreenContext } from "../wizard-screen/types";
import type { DependencyProbeEnvironment } from "./dependencies";

function createContext(hasScreen: boolean): BootstrapWizardContext {
  const appendLine = mock(() => undefined);
  const screen: WizardScreenContext | null = hasScreen
    ? {
        setSection: mock(() => undefined),
        appendLine,
        promptText: mock(async () => ""),
        promptYesNo: mock(async () => true),
        selectOne: mock(async (_prompt, optionsList) => optionsList[0]?.value),
        selectMany: mock(async () => []),
        previewTheme: mock(() => undefined),
        snapshot: mock(() => ({
          title: "Dependencies",
          subtitle: "",
          currentSection: "",
          currentDetail: "",
          logLines: [],
        })),
        destroy: mock(() => undefined),
      }
    : null;

  return {
    root: "/tmp/doolittle",
    options: {
      headless: false,
      skipWizard: false,
    },
    banner: () => undefined,
    section: mock(() => undefined),
    info: mock(() => undefined),
    warn: mock(() => undefined),
    formatKeyLabel: (label: string) => label,
    getWizardScreen: () => screen,
    setWizardScreen: () => undefined,
    abortBootstrap: () => undefined,
    raceBootstrapAbort: async <T>(operation: Promise<T>) => operation,
    throwIfBootstrapAborted: () => undefined,
  };
}

function createLinkedAccounts(): LinkedProviderAccountsSnapshot {
  return {
    codex: {
      provider: "codex",
      available: true,
      nativeReady: false,
      reusable: true,
      fallbackReady: false,
      detail: "Codex auth available",
      loginCommand: "codex login",
    },
    claudeCode: {
      provider: "claude-code",
      available: false,
      nativeReady: false,
      reusable: false,
      fallbackReady: true,
      detail: "Claude Code not linked",
      setupCommand: "claude setup-token",
      loginCommand: "claude auth login",
    },
    elizaCloud: {
      provider: "elizacloud",
      available: false,
      nativeReady: false,
      reusable: false,
      detail: "Eliza Cloud not linked",
    },
  };
}

async function loadDependenciesModule() {
  return import(
    `./dependencies?dependencies-tests=${Date.now()}-${Math.random()}`
  );
}

function createProbeEnvironment(): DependencyProbeEnvironment {
  return {
    spawnSync: ((_: string, argsOrOptions?: readonly string[] | object) => {
      const args = Array.isArray(argsOrOptions) ? argsOrOptions : [];
      const binary = String(args[1] ?? "").replace("command -v ", "");
      const installed = ["bun", "git", "daytona", "lightpanda"].includes(
        binary,
      );
      return { status: installed ? 0 : 1 } as never;
    }) as unknown as DependencyProbeEnvironment["spawnSync"],
    existsSync: (path) => String(path).includes("lightpanda"),
    platform: () => "darwin",
    arch: () => "arm64",
    release: () => "23.2.0",
    hostname: () => "doolittle-host",
    getLinkedProviderAccountsSnapshot: () => createLinkedAccounts(),
  };
}

describe("bootstrap dependency probes", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("builds dependency probes with env-driven browser command and auth readiness", async () => {
    const { getDependencyProbes } = await loadDependenciesModule();

    const probes = getDependencyProbes(
      "/tmp/doolittle-root",
      new Map([["DOOLITTLE_BROWSER_COMMAND", "custom-lightpanda"]]),
      createProbeEnvironment(),
    ) as BootstrapDependencyProbe[];

    const host = probes.find((probe) => probe.key === "host");
    const lightpanda = probes.find((probe) => probe.key === "lightpanda");
    const codex = probes.find((probe) => probe.key === "codex-auth");
    const claude = probes.find((probe) => probe.key === "claude-auth");

    expect(host?.installed).toBe(true);
    expect(host?.detail).toContain("darwin 23.2.0 · arm64 · doolittle-host");
    expect(host?.recommendation).toBe(
      "macOS detected. I will favor zsh-friendly paths and local app-style defaults.",
    );
    expect(lightpanda?.installed).toBe(true);
    expect(lightpanda?.detail).toBe("Preferred browser automation path.");
    expect(codex?.installed).toBe(true);
    expect(codex?.recommendation).toBeUndefined();
    expect(claude?.installed).toBe(false);
    expect(claude?.recommendation).toBe(
      "Run claude setup-token if you want the full native Claude Code path.",
    );
  });

  it("prints to wizard screen when available and includes missing recommendations", async () => {
    const context = createContext(true);
    const appendLine = context.getWizardScreen()?.appendLine as never;

    const { printDependencyProbes } = await loadDependenciesModule();

    const probes: BootstrapDependencyProbe[] = [
      {
        key: "bun",
        label: "Bun runtime",
        installed: true,
        detail: "Required for build",
      },
      {
        key: "git",
        label: "Git",
        installed: false,
        detail: "Used for workflows",
        recommendation: "Install Git",
      },
    ];

    printDependencyProbes(context, probes);

    expect(appendLine).toHaveBeenCalledWith("Bun runtime: online");
    expect(appendLine).toHaveBeenCalledWith("Git: missing");
    expect(context.info).toHaveBeenCalledWith("Required for build");
    expect(context.info).toHaveBeenCalledWith("Used for workflows");
    expect(context.warn).toHaveBeenCalledWith("Install Git");
  });

  it("logs to console when wizard screen is not available", async () => {
    const context = createContext(false);
    const section = context.section as ReturnType<typeof mock>;

    const { printDependencyProbes } = await loadDependenciesModule();

    const originalLog = console.log;
    const log = mock(() => undefined);
    console.log = log as never;

    const probes: BootstrapDependencyProbe[] = [
      {
        key: "git",
        label: "Git",
        installed: false,
        detail: "Used by workflows",
      },
    ];

    printDependencyProbes(context, probes);
    const loggedLines = (log.mock.calls as unknown as unknown[][]).map((call) =>
      String(call[0] ?? ""),
    );

    expect(section).toHaveBeenCalledWith(
      "Preflight",
      "I checked the machine before waking fully.",
    );
    expect(loggedLines.some((line) => line.includes("Git:"))).toBe(true);
    expect(loggedLines.some((line) => line.includes("missing"))).toBe(true);
    expect(context.info).toHaveBeenCalledWith("Used by workflows");
    console.log = originalLog;
  });
});

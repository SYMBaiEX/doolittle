import { describe, expect, it } from "bun:test";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../chat";
import { handleOperatorCommand } from "./operator-commands";

function createContext() {
  const events = {
    doctorInput: null as Record<string, unknown> | null,
    terminalCommands: [] as string[],
    progress: [] as string[],
  };

  const context = {
    runtime: {},
    services: {
      settings: {
        get: () => ({
          execution: {
            backend: "local",
          },
        }),
      },
      skills: {
        summary: () => ({ total: 3, groups: [] }),
      },
      contextFiles: {
        list: () => ["a.md", "b.md"],
      },
      cron: {
        recentRuns: () => [{ id: "cron-1" }, { id: "cron-2" }],
      },
      terminal: {
        recent: () => [
          {
            exitCode: 0,
            command: "pwd",
            backend: "local",
            backendMode: "direct",
            backendEngine: "bun",
            durationMs: 12,
            stdout: "/workspace",
            stderr: "",
          },
        ],
        runStreamingLocal: async (
          command: string,
          callbacks: {
            onStdout?: (chunk: string) => void;
            onStderr?: (chunk: string) => void;
          },
        ) => {
          events.terminalCommands.push(command);
          callbacks.onStdout?.("/workspace");
          callbacks.onStderr?.("");
          return {
            command,
            exitCode: 0,
            stdout: "/workspace",
            stderr: "",
            durationMs: 7,
          };
        },
      },
      repository: {
        isRepository: () => true,
        status: () => "clean",
        diffStat: () => "1 file changed",
        recentCommits: () => "abc123 fix router extraction",
      },
      diagnostics: {
        run: async (input: Record<string, unknown>) => {
          events.doctorInput = input;
          return [
            {
              status: "pass",
              summary: "Core runtime",
              detail: "healthy",
            },
            {
              status: "warn",
              summary: "Gateway",
              detail: "telegram not configured",
            },
          ];
        },
        setupChecklist: async () => ["Install deps", "Run check"],
      },
      operator: {
        setupSummary: async () => ({
          readiness: {
            level: "needs-attention",
            headline: "Shell is usable, but setup still needs attention.",
            detail: "providers 1/4 ready · transports 1/3 ready",
            nextSteps: ["Link a provider", "Enable a transport"],
          },
          providers: [
            { id: "openai", ready: true, detail: "Configured." },
            {
              id: "anthropic",
              ready: false,
              detail: "Missing ANTHROPIC_API_KEY.",
            },
          ],
          transports: [
            { id: "api", ready: true, detail: "API ready." },
            { id: "telegram", ready: false, detail: "Telegram disabled." },
          ],
          directories: [
            { label: "workspace", path: "/workspace/demo", exists: true },
            { label: "data", path: "/workspace/demo/.doolittle", exists: true },
          ],
        }),
        updatePreview: async () => ({
          readiness: {
            level: "ready",
            headline: "Update planning looks healthy.",
            detail: "git repository detected · workspace is clean",
            nextSteps: ["Run the standard validation loop."],
          },
          repositoryAvailable: true,
          repositoryStatus: "clean",
          recentCommits: "abc123 fix router extraction",
          recommendedSteps: ["Run bun test"],
        }),
        migrationSources: () => [{ path: "/tmp/source" }],
        migrationHistory: () => [{ id: "migration-1" }],
        inspectMigrationSource: (sourcePath: string) => ({ sourcePath }),
        applyMigration: (
          sourcePath: string,
          options: { overwrite: boolean },
        ) => ({
          sourcePath,
          overwrite: options.overwrite,
        }),
      },
    },
    gateway: {
      transportOverview: async () => ({ transports: 2 }),
    },
  } as unknown as AgentExecutionContext;

  const input: ChatTurnRequest = {
    message: "",
    userId: "local-user",
    roomId: "cli:local-user",
    source: "cli",
  };

  const hooks: AgentTurnHooks = {
    onResponseProgress: async (update) => {
      events.progress.push(update.response);
    },
  };

  return { context, input, hooks, events };
}

describe("operator command router", () => {
  it("renders doctor, setup, update, and migration command responses", async () => {
    const { context, input, hooks, events } = createContext();

    const doctor = await handleOperatorCommand(
      input,
      "/doctor",
      context,
      hooks,
    );
    const setup = await handleOperatorCommand(input, "/setup", context, hooks);
    const setupSummary = await handleOperatorCommand(
      input,
      "/setup summary",
      context,
      hooks,
    );
    const update = await handleOperatorCommand(
      input,
      "/update preview",
      context,
      hooks,
    );
    const migrate = await handleOperatorCommand(
      input,
      "/migrate scan",
      context,
      hooks,
    );
    const history = await handleOperatorCommand(
      input,
      "/migrate history",
      context,
      hooks,
    );
    const inspect = await handleOperatorCommand(
      input,
      "/migrate inspect /tmp/source",
      context,
      hooks,
    );
    const apply = await handleOperatorCommand(
      input,
      "/migrate apply /tmp/source :: overwrite=true",
      context,
      hooks,
    );

    expect(doctor).toContain("Doctor");
    expect(doctor).toContain("Overall: 1 pass, 1 warn, 0 fail");
    expect(doctor).toContain("Gateway: telegram not configured");
    expect(events.doctorInput).toMatchObject({
      skillsCount: 3,
      contextFilesCount: 2,
      recentCronRuns: 2,
      recentTerminalCommands: 1,
      repositoryAvailable: true,
      gatewayTransportOverview: { transports: 2 },
    });
    expect(setup).toBe("1. Install deps\n2. Run check");
    expect(setupSummary).toContain("Setup Summary");
    expect(setupSummary).toContain(
      "Shell is usable, but setup still needs attention.",
    );
    expect(setupSummary).toContain("Providers needing attention:");
    expect(update).toContain("Update Preview");
    expect(update).toContain("Git status: clean");
    expect(update).toContain("Validation loop:");
    expect(migrate).toContain("/tmp/source");
    expect(history).toContain("migration-1");
    expect(inspect).toContain("/tmp/source");
    expect(apply).toContain('"overwrite": true');
  });

  it("renders terminal and repo command responses and streams terminal progress", async () => {
    const { context, input, hooks, events } = createContext();

    const terminal = await handleOperatorCommand(
      input,
      "/terminal recent",
      context,
      hooks,
    );
    const run = await handleOperatorCommand(
      input,
      "/terminal run pwd",
      context,
      hooks,
    );
    const status = await handleOperatorCommand(
      input,
      "/repo status",
      context,
      hooks,
    );
    const diff = await handleOperatorCommand(
      input,
      "/repo diff",
      context,
      hooks,
    );
    const log = await handleOperatorCommand(input, "/repo log", context, hooks);

    expect(terminal).toContain("- [0] pwd");
    expect(run).toContain("Command: pwd");
    expect(run).toContain("STDOUT:");
    expect(events.terminalCommands).toEqual(["pwd"]);
    expect(events.progress.length).toBeGreaterThan(0);
    expect(status).toBe("clean");
    expect(diff).toBe("1 file changed");
    expect(log).toBe("abc123 fix router extraction");
  });
});

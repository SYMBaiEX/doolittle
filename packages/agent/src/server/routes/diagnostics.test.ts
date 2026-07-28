import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleDiagnosticsRoutes } from "@/server/routes/diagnostics";

function createContext() {
  return {
    runtime: {
      getService: (name: string) =>
        name === "cron"
          ? {
              runs: () => [{ id: "cron-1" }],
            }
          : null,
    },
    services: {
      diagnostics: {
        run: async (input: Record<string, unknown>) => ({
          ok: true,
          input,
        }),
        setupChecklist: async () => ["login", "gateway"],
      },
      operator: {
        setupSummary: async () => ({ ready: true }),
        updatePreview: async () => ({ pending: false }),
      },
      skills: {
        list: () => ["skill-a", "skill-b"],
      },
      contextFiles: {
        list: () => ["ctx.md"],
      },
      cron: {
        recentRuns: () => {
          throw new Error("legacy cron must not be used");
        },
      },
      terminal: {
        recent: () => [{ id: "cmd-1" }],
      },
      repository: {
        isRepository: () => true,
      },
    },
    gateway: {
      transportOverview: async () => ({ enabled: 1 }),
    },
  } as unknown as AppContext;
}

describe("handleDiagnosticsRoutes", () => {
  it("returns doctor checks with gateway context", async () => {
    const response = await handleDiagnosticsRoutes(
      createContext(),
      new Request("http://localhost/doctor"),
      new URL("http://localhost/doctor"),
    );

    expect(response).not.toBeNull();
    await expect(response?.json()).resolves.toEqual({
      checks: {
        ok: true,
        input: {
          skillsCount: 2,
          contextFilesCount: 1,
          recentCronRuns: 1,
          recentTerminalCommands: 1,
          repositoryAvailable: true,
          gatewayTransportOverview: {
            enabled: 1,
          },
        },
      },
    });
  });

  it("returns setup and update summaries", async () => {
    const checklistResponse = await handleDiagnosticsRoutes(
      createContext(),
      new Request("http://localhost/setup/checklist"),
      new URL("http://localhost/setup/checklist"),
    );
    const summaryResponse = await handleDiagnosticsRoutes(
      createContext(),
      new Request("http://localhost/setup/summary"),
      new URL("http://localhost/setup/summary"),
    );
    const updateResponse = await handleDiagnosticsRoutes(
      createContext(),
      new Request("http://localhost/update/preview"),
      new URL("http://localhost/update/preview"),
    );

    await expect(checklistResponse?.json()).resolves.toEqual({
      checklist: ["login", "gateway"],
    });
    await expect(summaryResponse?.json()).resolves.toEqual({
      summary: { ready: true },
    });
    await expect(updateResponse?.json()).resolves.toEqual({
      update: { pending: false },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleDiagnosticsRoutes(
      createContext(),
      new Request("http://localhost/not-diagnostics"),
      new URL("http://localhost/not-diagnostics"),
    );

    expect(response).toBeNull();
  });

  it("returns a clear service error while the Trigger runtime is unavailable", async () => {
    const context = createContext();
    context.runtime = { getService: () => null } as never;

    const response = await handleDiagnosticsRoutes(
      context,
      new Request("http://localhost/doctor"),
      new URL("http://localhost/doctor"),
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: "Trigger runtime service is not ready.",
    });
  });
});

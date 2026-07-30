import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { listTuiThemes, type TuiThemeName } from "@/runtime/theme-catalog";
import { handleSettingsExecutionRoutes } from "./settings-execution";

function createContext(): AppContext {
  const themeName = (listTuiThemes()[0]?.name ?? "orange") as TuiThemeName;
  const state = {
    ui: { theme: themeName },
    execution: { backend: "native" },
    model: {
      provider: "openai",
      model: "gpt-5.4",
      baseUrl: "https://api.openai.com/v1",
    },
  };
  const approvals = [
    {
      id: "approval-1",
      platform: "desktop",
      userId: "operator",
      roomId: "room-1",
      command: "bun test",
      reason: "Run verification",
      createdAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2026-07-27T01:00:00.000Z",
      status: "pending",
    },
    {
      id: "approval-used",
      platform: "desktop",
      userId: "operator",
      roomId: "room-1",
      command: "bun run build",
      reason: "Build",
      createdAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2026-07-27T01:00:00.000Z",
      status: "used",
    },
  ];

  return {
    runtime: {
      getSetting: () => "",
      setSetting: () => undefined,
      getService: (name: string) =>
        name === "shell"
          ? {
              status: async () => ({ ready: true, backend: "native" }),
            }
          : null,
    },
    services: {
      settings: {
        get: () => state,
        set: (path: string, value: string | number | boolean) => {
          if (path === "ui.theme" && typeof value === "string") {
            state.ui.theme = value as TuiThemeName;
          }
          return state;
        },
        setMany: (
          changes: Array<{ path: string; value: string | number | boolean }>,
        ) => {
          for (const { path, value } of changes) {
            if (path === "ui.theme" && typeof value === "string") {
              state.ui.theme = value as TuiThemeName;
            }
            if (path === "model.provider" && typeof value === "string") {
              state.model.provider = value;
            }
            if (path === "model.model" && typeof value === "string") {
              state.model.model = value;
            }
            if (path === "model.baseUrl" && typeof value === "string") {
              state.model.baseUrl = value;
            }
          }
          return state;
        },
      },
      terminal: {
        health: async () => [{ id: "native", ready: true }],
        status: async () => ({ ready: true, backend: "native" }),
        preview: (command: string, timeoutMs?: number) => ({
          command,
          timeoutMs,
        }),
      },
      executionApprovals: {
        list: (status?: string) =>
          approvals
            .filter((approval) => !status || approval.status === status)
            .map((approval) => ({ ...approval })),
        get: (id: string) => approvals.find((approval) => approval.id === id),
        approve: async (id: string, options?: { useImmediately?: boolean }) => {
          expect(options?.useImmediately).toBe(false);
          const approval = approvals.find((entry) => entry.id === id);
          if (!approval) throw new Error("not found");
          approval.status = "approved";
          return { ...approval };
        },
        deny: async (id: string) => {
          const approval = approvals.find((entry) => entry.id === id);
          if (!approval) throw new Error("not found");
          approval.status = "denied";
          return { ...approval };
        },
      },
    },
  } as unknown as AppContext;
}

describe("handleSettingsExecutionRoutes", () => {
  it("returns settings, theme, and execution status payloads", async () => {
    const context = createContext();
    const settings = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/settings"),
      new URL("http://localhost/settings"),
    );
    const theme = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/theme"),
      new URL("http://localhost/theme"),
    );
    const status = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/execution/status"),
      new URL("http://localhost/execution/status"),
    );

    const settingsBody = await settings?.json();
    const themeBody = await theme?.json();

    expect(settingsBody).toHaveProperty("settings");
    expect(themeBody).toHaveProperty("active");
    expect(themeBody).toHaveProperty("themes");
    await expect(status?.json()).resolves.toEqual({
      active: { backend: "native" },
      backends: [{ id: "native", ready: true }],
      native: { ready: true, backend: "native" },
    });
  });

  it("validates execution preview and theme payloads", async () => {
    const context = createContext();
    const invalidPreview = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/execution/preview", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/execution/preview"),
    );
    const invalidTheme = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/theme", {
        method: "POST",
        body: JSON.stringify({ theme: "not-a-theme" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/theme"),
    );
    const invalidSettings = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/settings", {
        method: "POST",
        body: JSON.stringify({
          changes: [
            { path: "model.provider", value: "ollama" },
            { path: "__proto__.polluted", value: true },
          ],
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/settings"),
    );
    const unchangedSettings = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/settings"),
      new URL("http://localhost/settings"),
    );

    expect(invalidPreview?.status).toBe(400);
    await expect(invalidPreview?.json()).resolves.toEqual({
      error: "command is required",
    });
    expect(invalidTheme?.status).toBe(400);
    expect(await invalidTheme?.json()).toHaveProperty(
      "error",
      "valid theme is required",
    );
    expect(invalidSettings?.status).toBe(400);
    await expect(unchangedSettings?.json()).resolves.toMatchObject({
      settings: { model: { provider: "openai" } },
    });
  });

  it("updates settings, previews execution, and rotates themes", async () => {
    const context = createContext();
    const updated = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/settings", {
        method: "POST",
        body: JSON.stringify({
          path: "ui.theme",
          value: listTuiThemes()[1]?.name,
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/settings"),
    );
    const routeUpdated = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/settings", {
        method: "POST",
        body: JSON.stringify({
          changes: [
            { path: "model.provider", value: "ollama" },
            { path: "model.model", value: "granite4.1:3b" },
            {
              path: "model.baseUrl",
              value: "http://127.0.0.1:11434",
            },
          ],
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/settings"),
    );
    const preview = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/execution/preview", {
        method: "POST",
        body: JSON.stringify({ command: "ls", timeoutMs: 50 }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/execution/preview"),
    );
    const next = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/theme/next", { method: "POST" }),
      new URL("http://localhost/theme/next"),
    );
    const prev = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/theme/prev", { method: "POST" }),
      new URL("http://localhost/theme/prev"),
    );

    expect(await updated?.json()).toHaveProperty("settings");
    await expect(routeUpdated?.json()).resolves.toMatchObject({
      settings: {
        model: {
          provider: "ollama",
          model: "granite4.1:3b",
          baseUrl: "http://127.0.0.1:11434",
        },
      },
    });
    await expect(preview?.json()).resolves.toEqual({
      preview: { command: "ls", timeoutMs: 50 },
    });
    expect(await next?.json()).toHaveProperty("active");
    expect(await prev?.json()).toHaveProperty("active");
  });

  it("lists, filters, approves, and denies execution approvals without running them", async () => {
    const context = createContext();
    const listed = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/execution/approvals"),
      new URL("http://localhost/execution/approvals"),
    );
    const pending = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/execution/approvals?status=pending"),
      new URL("http://localhost/execution/approvals?status=pending"),
    );
    const approved = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/execution/approvals/approval-1/approve", {
        method: "POST",
      }),
      new URL("http://localhost/execution/approvals/approval-1/approve"),
    );

    await expect(listed?.json()).resolves.toMatchObject({
      approvals: [{ id: "approval-1" }, { id: "approval-used" }],
    });
    await expect(pending?.json()).resolves.toMatchObject({
      approvals: [{ id: "approval-1" }],
    });
    await expect(approved?.json()).resolves.toMatchObject({
      approval: { id: "approval-1", status: "approved" },
    });

    const deniedContext = createContext();
    const denied = await handleSettingsExecutionRoutes(
      deniedContext,
      new Request("http://localhost/execution/approvals/approval-1/deny", {
        method: "POST",
      }),
      new URL("http://localhost/execution/approvals/approval-1/deny"),
    );
    await expect(denied?.json()).resolves.toMatchObject({
      approval: { id: "approval-1", status: "denied" },
    });
  });

  it("rejects invalid approval filters and resolved or missing decisions", async () => {
    const context = createContext();
    const invalid = await handleSettingsExecutionRoutes(
      context,
      new Request("http://localhost/execution/approvals?status=unknown"),
      new URL("http://localhost/execution/approvals?status=unknown"),
    );
    const resolved = await handleSettingsExecutionRoutes(
      context,
      new Request(
        "http://localhost/execution/approvals/approval-used/approve",
        { method: "POST" },
      ),
      new URL("http://localhost/execution/approvals/approval-used/approve"),
    );
    const missing = await handleSettingsExecutionRoutes(
      context,
      new Request(
        "http://localhost/execution/approvals/missing-approval/deny",
        { method: "POST" },
      ),
      new URL("http://localhost/execution/approvals/missing-approval/deny"),
    );

    expect(invalid?.status).toBe(400);
    expect(resolved?.status).toBe(409);
    expect(missing?.status).toBe(404);
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleSettingsExecutionRoutes(
      createContext(),
      new Request("http://localhost/not-settings"),
      new URL("http://localhost/not-settings"),
    );

    expect(response).toBeNull();
  });
});

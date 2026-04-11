import { describe, expect, it } from "bun:test";
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

  return {
    runtime: {
      getSetting: () => "",
      setSetting: () => undefined,
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
      },
      terminal: {
        health: async () => [{ id: "native", ready: true }],
        status: async () => ({ ready: true, backend: "native" }),
        preview: (command: string, timeoutMs?: number) => ({
          command,
          timeoutMs,
        }),
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
    const invalidPreview = await handleSettingsExecutionRoutes(
      createContext(),
      new Request("http://localhost/execution/preview", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/execution/preview"),
    );
    const invalidTheme = await handleSettingsExecutionRoutes(
      createContext(),
      new Request("http://localhost/theme", {
        method: "POST",
        body: JSON.stringify({ theme: "not-a-theme" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/theme"),
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
    await expect(preview?.json()).resolves.toEqual({
      preview: { command: "ls", timeoutMs: 50 },
    });
    expect(await next?.json()).toHaveProperty("active");
    expect(await prev?.json()).toHaveProperty("active");
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

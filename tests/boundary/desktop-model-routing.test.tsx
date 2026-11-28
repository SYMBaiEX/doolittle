// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ROUTE_PROVIDER_CARD_CLASS } from "../../apps/desktop/src/renderer/app-shell/overlay-layout";
import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";
import {
  apiResourceCacheKey,
  desktopQueryClient,
} from "../../apps/desktop/src/renderer/lib";
import { ModelsPage } from "../../apps/desktop/src/renderer/ModelsPage";
import {
  linkedProviderAccess,
  providerReadiness,
  ROUTE_PROVIDER_OPTIONS,
} from "../../apps/desktop/src/renderer/model-routing";
import { SettingControl } from "../../apps/desktop/src/renderer/settings/SettingsFields";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(),
}));

it("presents passive credential status as unchecked until the user verifies it", () => {
  const codex = { checked: false, nativeReady: false };
  expect(providerReadiness("codex", { codex })).toMatchObject({
    checked: false,
    ready: false,
    tone: "neutral",
  });
  expect(linkedProviderAccess(codex)).toMatchObject({
    label: "Not checked",
    mode: "unchecked",
  });
});

it("saves a valid existing token budget from closed generation controls", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const settings = {
    settings: {
      model: {
        provider: "codex",
        model: "coding-model",
        temperature: 0.4,
        maxTokens: 1200,
      },
    },
  };
  desktopQueryClient.setQueryData(
    [apiResourceCacheKey("/settings", [true])],
    settings,
  );
  desktopQueryClient.setQueryData(
    [apiResourceCacheKey("/runtime/models?refresh=false", [true, false])],
    { providers: [], capabilities: [] },
  );
  vi.mocked(desktopRequest).mockResolvedValue(settings);

  try {
    act(() =>
      root.render(
        <ModelsPage active runtime={null} refreshRuntime={() => {}} />,
      ),
    );
    expect(
      container.querySelector<HTMLDetailsElement>("[data-model-tuning]")?.open,
    ).toBe(false);
    expect(
      container
        .querySelectorAll<HTMLInputElement>('input[type="number"]')[1]
        ?.checkValidity(),
    ).toBe(true);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.click(),
    );
    expect(desktopRequest).toHaveBeenCalledWith("/settings", "POST", {
      changes: expect.arrayContaining([
        { path: "model.maxTokens", value: 1200 },
      ]),
    });
  } finally {
    act(() => root.unmount());
    container.remove();
    desktopQueryClient.clear();
    vi.mocked(desktopRequest).mockReset();
  }
});

it("waits for the provider-readiness disclosure before requesting accounts", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const settings = {
    settings: { model: { provider: "codex", model: "fixture" } },
  };
  const models = { providers: [], capabilities: [] };
  desktopQueryClient.setQueryData(
    [apiResourceCacheKey("/settings", [true])],
    settings,
  );
  desktopQueryClient.setQueryData(
    [apiResourceCacheKey("/runtime/models?refresh=false", [true, false])],
    models,
  );
  vi.mocked(desktopRequest).mockImplementation(async (path) => {
    if (path === "/runtime/accounts") return { accounts: {} };
    return path === "/settings" ? settings : models;
  });

  try {
    await act(async () =>
      root.render(
        <ModelsPage active runtime={null} refreshRuntime={() => {}} />,
      ),
    );
    expect(
      vi
        .mocked(desktopRequest)
        .mock.calls.some(([path]) => path === "/runtime/accounts"),
    ).toBe(false);
    const readiness = [...container.querySelectorAll("details")].find(
      (details) =>
        details
          .querySelector("summary")
          ?.textContent?.includes("Provider readiness"),
    );
    expect(readiness?.open).toBe(false);
    await act(async () => {
      if (readiness) {
        readiness.open = true;
        readiness.dispatchEvent(new Event("toggle"));
      }
    });
    expect(
      vi
        .mocked(desktopRequest)
        .mock.calls.filter(([path]) => path === "/runtime/accounts"),
    ).toHaveLength(1);
  } finally {
    act(() => root.unmount());
    container.remove();
    desktopQueryClient.clear();
    vi.mocked(desktopRequest).mockReset();
  }
});

it("keeps route provider card hover affordances off disabled providers", () => {
  expect(ROUTE_PROVIDER_CARD_CLASS).not.toMatch(/(?:^|\s)hover:/);
  expect(ROUTE_PROVIDER_CARD_CLASS).toContain("enabled:hover:");
  expect(ROUTE_PROVIDER_CARD_CLASS).toContain("disabled:opacity-55");
});

it("keeps a removed saved provider visible but unavailable until another route is selected", () => {
  expect(ROUTE_PROVIDER_OPTIONS.map((option) => option.id)).not.toContain(
    "devin",
  );
  expect(providerReadiness("devin", null)).toMatchObject({
    ready: false,
    tone: "warn",
  });
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        createElement(SettingControl, {
          field: { path: "model.provider", category: "model", value: "devin" },
          onSaved: () => {},
        }),
      ),
    );
    const select = container.querySelector("select");
    expect(select?.value).toBe("devin");
    const unavailable = [...(select?.options ?? [])].find(
      (option) => option.value === "devin",
    );
    expect(unavailable?.disabled).toBe(true);
    expect(unavailable?.textContent).toContain("unavailable");
    expect(
      [...(select?.options ?? [])].find((option) => option.value === "codex")
        ?.disabled,
    ).toBe(false);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("routes a custom OpenAI-compatible endpoint key through the vault and pool, not settings", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const settings = {
    settings: {
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        baseUrl: "https://proxy.example.com/v1",
        temperature: 0.4,
        maxTokens: 1200,
      },
    },
  };
  const models = {
    providers: [
      {
        id: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        models: [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }],
      },
    ],
    capabilities: [],
  };
  desktopQueryClient.setQueryData(
    [apiResourceCacheKey("/settings", [true])],
    settings,
  );
  desktopQueryClient.setQueryData(
    [apiResourceCacheKey("/runtime/models?refresh=false", [true, false])],
    models,
  );
  vi.mocked(desktopRequest).mockResolvedValue(settings);

  const type = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  try {
    await act(async () =>
      root.render(
        <ModelsPage active runtime={null} refreshRuntime={() => {}} />,
      ),
    );
    // The openai route exposes a free-text model input for custom endpoints.
    const modelInput = container.querySelector<HTMLInputElement>(
      "input[list]:not([type])",
    );
    expect(modelInput).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    await act(async () => {
      type(modelInput as HTMLInputElement, "my-custom-model");
      type(
        container.querySelector('input[type="password"]') as HTMLInputElement,
        "sk-custom-secret",
      );
    });
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.click(),
    );
    const calls = vi.mocked(desktopRequest).mock.calls;
    expect(calls).toContainEqual([
      "/secrets/set",
      "POST",
      { key: "OPENAI_API_KEY", value: "sk-custom-secret" },
    ]);
    expect(calls).toContainEqual([
      "/runtime/account-pool/openai-api/import",
      "POST",
      {
        accountId: "custom-openai-endpoint",
        label: "Custom OpenAI-compatible endpoint",
        secretKeyName: "OPENAI_API_KEY",
      },
    ]);
    const settingsCall = calls.find(([path]) => path === "/settings");
    expect(settingsCall).toBeTruthy();
    if (!settingsCall) throw new Error("settings call missing");
    const changes = (
      settingsCall[2] as unknown as {
        changes: Array<{ path: string; value: unknown }>;
      }
    ).changes;
    expect(changes).toContainEqual({
      path: "model.model",
      value: "my-custom-model",
    });
    expect(changes).toContainEqual({
      path: "model.baseUrl",
      value: "https://proxy.example.com/v1",
    });
    // The secret value must never be written into persisted settings.
    expect(JSON.stringify(changes)).not.toContain("sk-custom-secret");
  } finally {
    act(() => root.unmount());
    container.remove();
    desktopQueryClient.clear();
    vi.mocked(desktopRequest).mockReset();
  }
});

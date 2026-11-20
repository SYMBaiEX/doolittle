// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  linkedProviderAccess,
  providerReadiness,
  ROUTE_PROVIDER_OPTIONS,
} from "../../apps/desktop/src/renderer/model-routing";
import { SettingControl } from "../../apps/desktop/src/renderer/settings/SettingsFields";

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

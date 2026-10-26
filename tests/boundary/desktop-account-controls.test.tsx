// @vitest-environment jsdom

import { act, type ComponentProps, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../apps/desktop/src/renderer/lib", () => ({
  Badge: ({ children }: { children: React.ReactNode }) =>
    createElement("span", null, children),
}));

import { assertDesktopRendererBoundary } from "../../apps/desktop/scripts/desktop-build-inventory";
import { AccountCard } from "../../apps/desktop/src/renderer/connections/AccountCard";

let root: Root;
let container: HTMLDivElement;
const account = {
  id: "fixture",
  label: "Work account",
  providerId: "anthropic-subscription",
  source: "oauth",
  priority: 0,
  enabled: true,
  health: "ok",
  hasCredential: true,
  createdAt: 1,
  usage: { sessionPct: 35, weeklyPct: 72 },
} as ComponentProps<typeof AccountCard>["account"];
const onPatch = vi.fn().mockResolvedValue(undefined);
const onDelete = vi.fn().mockResolvedValue(undefined);
const onTest = vi.fn().mockResolvedValue(undefined);
const onRefreshUsage = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  for (const fn of [onPatch, onDelete, onTest, onRefreshUsage])
    fn.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function render(saving = false) {
  act(() =>
    root.render(
      createElement(AccountCard, {
        account,
        saving,
        isFirst: true,
        isLast: true,
        onPatch,
        onDelete,
        onTest,
        onRefreshUsage,
        onMoveUp: vi.fn(),
        onMoveDown: vi.fn(),
      }),
    ),
  );
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === text,
  );
  expect(button).toBeTruthy();
  await act(async () => button?.click());
}
it("keeps account health, usage, enablement, test and refresh connected to Eliza actions", async () => {
  render();
  expect(container.textContent).toContain("Healthy");
  expect(container.textContent).toContain("72%");
  expect(
    container.querySelector<HTMLButtonElement>('[aria-label="Move up"]')
      ?.disabled,
  ).toBe(true);
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('input[type="checkbox"]')
      ?.click(),
  );
  expect(onPatch).toHaveBeenCalledWith({ enabled: false });
  await click("Test");
  await click("Refresh");
  expect(onTest).toHaveBeenCalledTimes(1);
  expect(onRefreshUsage).toHaveBeenCalledTimes(1);
  render(true);
  expect(
    container.querySelector<HTMLInputElement>('input[type="checkbox"]')
      ?.disabled,
  ).toBe(true);
});
it("renames accounts and keeps failed delete confirmation open for retry", async () => {
  render();
  await click("Work account");
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="Account label"]',
    );
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "Personal account");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Save label");
  expect(onPatch).toHaveBeenCalledWith({ label: "Personal account" });
  onDelete.mockRejectedValueOnce(new Error("private transport payload"));
  await click("Delete account");
  expect(onDelete).not.toHaveBeenCalled();
  await click("Confirm delete");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Account update failed. Try again.",
  );
  expect(document.body.textContent).not.toContain("private transport payload");
  await click("Confirm delete");
  expect(onDelete).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("rejects SDK standalone state and hosted wallet modules when they enter the rendered desktop", () => {
  for (const path of [
    "state/index.js",
    "cloud/billing/wallet/steward-wallet-providers.js",
  ]) {
    const bundle = {
      main: {
        type: "chunk" as const,
        fileName: "main.js",
        code: "fixture",
        modules: {
          [`/fixture/node_modules/@elizaos/ui/${path}`]: { renderedLength: 1 },
        },
      },
    };
    expect(() => assertDesktopRendererBoundary(bundle)).toThrow(
      "standalone Eliza",
    );
    bundle.main.modules[
      `/fixture/node_modules/@elizaos/ui/${path}`
    ].renderedLength = 0;
    expect(() => assertDesktopRendererBoundary(bundle)).not.toThrow();
  }
});

it.each([
  "@coinbase/cdp-sdk/_esm/index.js",
  "@solana/wallet-adapter-react/lib/esm/index.js",
  "@solana/wallet-adapter-react-ui/lib/esm/index.js",
  "@solana-mobile/wallet-adapter-mobile/lib/index.js",
  "react-native/index.js",
])("rejects hosted or mobile wallet code in the renderer: %s", (path) => {
  const bundle = {
    main: {
      type: "chunk" as const,
      fileName: "main.js",
      code: "fixture",
      modules: {
        [`/fixture/node_modules/${path}`]: {
          renderedLength: 1,
        },
      },
    },
  };
  expect(() => assertDesktopRendererBoundary(bundle)).toThrow(
    "standalone Eliza",
  );
  const primitive = {
    main: {
      ...bundle.main,
      modules: {
        "/fixture/node_modules/@elizaos/ui/components/ui/button.js": {
          renderedLength: 1,
        },
      },
    },
  };
  expect(() => assertDesktopRendererBoundary(primitive)).not.toThrow();
});

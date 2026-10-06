// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountPoolAccount } from "../../shared/contracts";
import { AccountPoolDirectory } from "./AccountPoolDirectory";
import { AccountPoolPanel } from "./AccountPoolPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const accounts: AccountPoolAccount[] = [
  {
    providerId: "openai-codex",
    accountId: "work",
    label: "Work",
    source: "oauth",
    enabled: true,
    priority: 0,
    createdAt: 1,
    health: "ok",
  },
  {
    providerId: "openai-codex",
    accountId: "backup",
    label: "Backup",
    source: "oauth",
    enabled: false,
    priority: 1,
    createdAt: 2,
    health: "unknown",
  },
];
function directoryProps(
  overrides: Partial<ComponentProps<typeof AccountPoolDirectory>> = {},
): ComponentProps<typeof AccountPoolDirectory> {
  return {
    authProvider: "codex",
    busy: "",
    descriptor: { label: "Codex", provider: "openai-codex" },
    onAccountImportChange: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onMove: vi.fn().mockResolvedValue(undefined),
    onPatch: vi.fn().mockResolvedValue(undefined),
    onRefreshUsage: vi.fn().mockResolvedValue(undefined),
    onSignIn: vi.fn(),
    onTest: vi.fn().mockResolvedValue(undefined),
    snapshot: { strategy: "priority", accounts },
    ...overrides,
  };
}

describe("model account context menus", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  async function openAccount(index: number) {
    const row = host.querySelectorAll(
      'section[aria-label="Codex accounts"] > ul > li',
    )[index];
    expect(row).not.toBeNull();
    await act(async () =>
      row?.querySelector("div")?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    expect(document.body.querySelectorAll('[role="menu"]')).toHaveLength(1);
  }
  function item(label: string) {
    return [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((entry) => entry.textContent === label);
  }
  async function choose(label: string) {
    expect(item(label)).toBeDefined();
    await act(async () => item(label)?.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }

  it("patches and tests only the exact account without adding credential or unconfirmed deletion actions", async () => {
    const props = directoryProps();
    await act(async () => root.render(<AccountPoolDirectory {...props} />));
    await openAccount(1);
    expect(
      document.body.querySelector('[role="menu"]')?.getAttribute("aria-label"),
    ).toBe("Model account: Backup");
    expect(
      document.body.querySelector('[role="menu"]')?.textContent,
    ).not.toMatch(/Copy|credential|Remove|Delete|Rename/u);
    await choose("Enable account");
    expect(props.onPatch).toHaveBeenCalledWith(
      { accountId: "backup", label: "Backup" },
      { enabled: true },
    );
    await openAccount(1);
    await choose("Test account connection");
    expect(props.onTest).toHaveBeenCalledWith(
      expect.objectContaining({ id: "backup", providerId: "openai-codex" }),
    );
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(
      host.querySelector(
        '[aria-label="Delete account"], [aria-label="accounts.delete"]',
      ),
    ).not.toBeNull();
  });

  it("keeps existing priority bounds and busy guards", async () => {
    const props = directoryProps();
    await act(async () => root.render(<AccountPoolDirectory {...props} />));
    await openAccount(0);
    expect(item("Move account up")?.hasAttribute("data-disabled")).toBe(true);
    expect(item("Move account down")?.hasAttribute("data-disabled")).toBe(
      false,
    );
    await choose("Move account down");
    expect(props.onMove).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "work" }),
        expect.objectContaining({ id: "backup" }),
      ]),
      "work",
      "down",
    );
    await act(async () =>
      root.render(
        <AccountPoolDirectory {...props} busy="openai-codex:work:test" />,
      ),
    );
    await openAccount(1);
    for (const action of document.body.querySelectorAll('[role="menuitem"]'))
      expect(action.hasAttribute("data-disabled")).toBe(true);
    await choose("Enable account");
    expect(props.onPatch).not.toHaveBeenCalled();
  });

  it("revokes menus when a provider identity or account order changes", async () => {
    const props = directoryProps();
    await act(async () => root.render(<AccountPoolDirectory {...props} />));
    await openAccount(0);
    await act(async () =>
      root.render(
        <AccountPoolDirectory
          {...props}
          descriptor={{ label: "Claude", provider: "anthropic-subscription" }}
        />,
      ),
    );
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(props.onPatch).not.toHaveBeenCalled();
  });

  it("uses existing pool manage and preview actions rather than introducing a second manager", async () => {
    const directory = directoryProps();
    const onPreview = vi.fn();
    await act(async () =>
      root.render(
        <AccountPoolPanel
          {...directory}
          descriptor={{ ...directory.descriptor, shortLabel: "CX" }}
          bridgeInstalled
          onPreview={onPreview}
          onSetStrategy={vi.fn()}
        />,
      ),
    );
    const openHeader = async () => {
      await act(async () =>
        host.querySelector("header h3")?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
          }),
        ),
      );
    };
    await openHeader();
    await choose("Manage accounts");
    expect(
      host.querySelector("[data-provider-pool-body]")?.hasAttribute("hidden"),
    ).toBe(false);
    await openHeader();
    await choose("Preview next account");
    expect(onPreview).toHaveBeenCalledOnce();
  });
});

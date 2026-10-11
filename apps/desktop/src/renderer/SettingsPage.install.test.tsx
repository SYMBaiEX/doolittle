// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useApiResourceMock } = vi.hoisted(() => ({
  useApiResourceMock: vi.fn(),
}));

vi.mock("./lib", async () => {
  const actual = await vi.importActual<typeof import("./lib")>("./lib");
  return { ...actual, useApiResource: useApiResourceMock };
});

import type {
  DesktopUpdateState,
  DoolittleDesktopBridge,
} from "../shared/contracts";
import { SettingsPage } from "./SettingsPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function resource(data: unknown) {
  return { data, error: "", loading: false, reload: vi.fn() };
}

describe("SettingsPage update installation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    useApiResourceMock.mockImplementation((path: string | null) =>
      path === "/settings" ? resource({ settings: {} }) : resource(null),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("recovers failed desktop state reads and ignores a stale initial update reply after a host event", async () => {
    let resolveUpdate: ((state: DesktopUpdateState) => void) | undefined;
    let updateListener: ((state: DesktopUpdateState) => void) | undefined;
    const lifecycle = vi
      .fn()
      .mockRejectedValueOnce(new Error("host unavailable"))
      .mockResolvedValue({ keepRunningInBackground: true });
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: {
        getLifecycleState: lifecycle,
        getUpdateState: vi.fn(
          () =>
            new Promise<DesktopUpdateState>((resolve) => {
              resolveUpdate = resolve;
            }),
        ),
        onUpdateState: vi.fn((listener) => {
          updateListener = listener;
          return () => undefined;
        }),
        checkForUpdates: vi.fn(),
        downloadUpdate: vi.fn(),
        installUpdate: vi.fn(),
        setKeepRunningInBackground: vi.fn(),
      },
    });
    await act(async () => root.render(<SettingsPage active />));
    expect(container.textContent).toContain(
      "Desktop behavior could not be loaded",
    );
    expect(container.textContent).not.toContain("Loading desktop state");
    const retry = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Retry desktop state");
    await act(async () => retry?.click());
    expect(lifecycle).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked,
    ).toBe(true);
    await act(async () =>
      updateListener?.({ phase: "downloaded", message: "New host update" }),
    );
    await act(async () =>
      resolveUpdate?.({ phase: "idle", message: "Stale update state" }),
    );
    expect(container.textContent).toContain("New host update");
    expect(container.textContent).not.toContain("Stale update state");
  });

  it("admits one background write and requires authoritative state after a failed response", async () => {
    let rejectWrite: ((error: Error) => void) | undefined;
    const background = vi.fn(
      () =>
        new Promise((_, reject) => {
          rejectWrite = reject;
        }),
    );
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: {
        getLifecycleState: vi.fn(async () => ({
          keepRunningInBackground: false,
        })),
        getUpdateState: vi.fn(async () => ({
          phase: "idle",
          message: "No update checked",
        })),
        onUpdateState: vi.fn(() => () => undefined),
        checkForUpdates: vi.fn(),
        downloadUpdate: vi.fn(),
        installUpdate: vi.fn(),
        setKeepRunningInBackground: background,
      },
    });
    await act(async () => root.render(<SettingsPage active />));
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    await act(async () => {
      checkbox?.click();
      checkbox?.click();
    });
    expect(background).toHaveBeenCalledOnce();
    expect(checkbox?.disabled).toBe(true);
    await act(async () => rejectWrite?.(new Error("Unknown response")));
    expect(checkbox?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Background behavior could not be confirmed",
    );
    expect(container.textContent).toContain("Retry desktop state");
  });

  it("locks an accepted install until provider failure and then allows retry", async () => {
    const install = vi.fn(async () => undefined);
    let updateListener: ((state: DesktopUpdateState) => void) | undefined;
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: {
        checkForUpdates: vi.fn(),
        downloadUpdate: vi.fn(),
        getLifecycleState: vi.fn(async () => ({
          keepRunningInBackground: false,
        })),
        getUpdateState: vi.fn(async () => ({
          phase: "downloaded",
          message: "Ready to install",
        })),
        installUpdate: install,
        onUpdateState: vi.fn((listener) => {
          updateListener = listener;
          return () => undefined;
        }),
        setKeepRunningInBackground: vi.fn(),
      } as Pick<
        DoolittleDesktopBridge,
        | "checkForUpdates"
        | "downloadUpdate"
        | "getLifecycleState"
        | "getUpdateState"
        | "installUpdate"
        | "onUpdateState"
        | "setKeepRunningInBackground"
      >,
    });

    await act(async () => root.render(<SettingsPage active />));
    expect(container.querySelector("h1")?.textContent).toBe("General");
    expect(container.textContent).toContain("Keep running in the background");

    const installButton =
      container.querySelector<HTMLButtonElement>(".primary-button");
    await act(async () => {
      installButton?.click();
      installButton?.click();
      await Promise.resolve();
    });

    expect(install).toHaveBeenCalledOnce();
    expect(installButton?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Installing update and restarting Doolittle…",
    );

    await act(async () => {
      updateListener?.({ phase: "error", message: "Native updater failed" });
    });
    expect(container.textContent).toContain("Native updater failed");
    const checkButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Check for updates",
    );
    expect(checkButton?.disabled).toBe(false);

    await act(async () => {
      updateListener?.({
        phase: "downloaded",
        version: "1.2.1",
        message: "Ready to install",
      });
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".primary-button")?.click();
      await Promise.resolve();
    });
    expect(install).toHaveBeenCalledTimes(2);
  });
});

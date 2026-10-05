// @vitest-environment jsdom
import { act, type ButtonHTMLAttributes, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  DesktopUiInterfaceBridge,
  UiInterfaceState,
} from "../../shared/ui-interface";

vi.mock("@doolittle/ui", () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button {...props} />
  ),
  StateSurface: ({ title }: { title: string }) => <p role="status">{title}</p>,
}));

import { InterfaceHost } from "./InterfaceHost";

const defaultState: UiInterfaceState = {
  mode: "default",
  installed: [],
  safeMode: false,
};
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "doolittle", {
    configurable: true,
    value: { platform: "darwin" },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
it("retains native component state through community activation, host-surface reveal and restoration", async () => {
  let emit!: (value: UiInterfaceState) => void;
  const detach = vi.fn();
  const restore = vi.fn(async () => {
    emit(defaultState);
    return defaultState;
  });
  const bridge = {
    getState: async () => defaultState,
    onState: (receive: typeof emit) => {
      emit = receive;
      return detach;
    },
    restore,
    stopAll: vi.fn(),
    returnToInterface: vi.fn(),
  } as unknown as DesktopUiInterfaceBridge;
  let mounts = 0;
  let unmounts = 0;
  function Native() {
    const [value] = useState("retained draft");
    useEffect(() => {
      mounts++;
      return () => {
        unmounts++;
      };
    }, []);
    return <input aria-label="Draft" value={value} readOnly />;
  }
  await act(async () =>
    root.render(
      <InterfaceHost bridge={bridge}>
        <Native />
      </InterfaceHost>,
    ),
  );
  const input = container.querySelector<HTMLInputElement>("input");
  act(() => emit({ ...defaultState, mode: "community-static" }));
  expect(input?.closest("[hidden][inert]")).not.toBeNull();
  expect(mounts).toBe(1);
  expect(unmounts).toBe(0);
  act(() =>
    emit({
      ...defaultState,
      mode: "community-static",
      hostSurface: {
        target: { botId: "bot", sessionId: "chat" },
        surface: "computer",
      },
    }),
  );
  expect(input?.closest("[hidden]")).toBeNull();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Restore default interface"]',
      )
      ?.click(),
  );
  expect(restore).toHaveBeenCalledOnce();
  expect(input?.value).toBe("retained draft");
  expect(unmounts).toBe(0);
  expect(bridge.stopAll).not.toHaveBeenCalled();
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilesPage } from "./ProfilesPage";

const host = vi.hoisted(() => ({
  request: vi.fn(async () => ({})),
  reload: vi.fn(),
}));
vi.mock("./lib", async (importOriginal) => {
  const original = await importOriginal<typeof import("./lib")>();
  return {
    ...original,
    desktopRequest: host.request,
    useApiResource: () => ({
      data: {
        active: { id: "default", name: "Doolittle" },
        available: [
          { id: "default", name: "Doolittle" },
          { id: "specialist", name: "Research specialist" },
        ],
      },
      loading: false,
      error: "",
      reload: host.reload,
    }),
  };
});
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("profile row context actions", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host.request.mockClear();
    host.reload.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  it("uses the existing activation endpoint for the chosen profile", async () => {
    await act(async () => root.render(<ProfilesPage active />));
    await act(async () =>
      container.querySelector("[data-catalog-row] strong")?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    const useProfile = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((item) => item.textContent === "Use profile");
    expect(useProfile).toBeDefined();
    await act(async () => useProfile?.click());
    expect(host.request).toHaveBeenCalledExactlyOnceWith(
      "/personality",
      "POST",
      { id: "specialist" },
    );
    expect(host.reload).toHaveBeenCalledOnce();
  });
});

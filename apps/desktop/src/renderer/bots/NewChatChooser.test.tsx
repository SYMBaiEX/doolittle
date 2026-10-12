// @vitest-environment jsdom
import type { BotSummary } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewChatChooser } from "./NewChatChooser";

describe("new chat bot chooser", () => {
  let host: HTMLDivElement;
  let root: Root;
  let trigger: HTMLButtonElement;
  let raf: ReturnType<typeof vi.spyOn>;
  const onChoose = vi.fn();
  const onCreate = vi.fn();
  const onClose = vi.fn();
  const bots = [
    { id: "lead", name: "Doolittle", isDefault: true },
    { id: "ada", name: "Ada" },
    { id: "archived", name: "Old bot", archivedAt: "2026-10-01" },
  ] as BotSummary[];
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    host = document.createElement("div");
    trigger = document.createElement("button");
    document.body.append(trigger, host);
    root = createRoot(host);
    trigger.focus();
    raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    trigger.remove();
    raf.mockRestore();
  });
  const render = async (loading = false, error = "") =>
    act(async () =>
      root.render(
        <NewChatChooser
          bots={bots}
          loading={loading}
          error={error}
          onChoose={onChoose}
          onCreate={onCreate}
          onClose={onClose}
          onRetry={vi.fn()}
          returnFocusTarget={trigger}
        />,
      ),
    );
  it("shows create and existing bots, excluding archived bots; selection has no runtime side effect", async () => {
    await render();
    expect(host.textContent).toContain("Start a chat with");
    expect(host.textContent).not.toContain("Old bot");
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((entry) => entry.textContent?.includes("Ada"))
        ?.click(),
    );
    expect(onChoose).toHaveBeenCalledWith("ada");
    expect(onCreate).not.toHaveBeenCalled();
  });
  it("filters bots while retaining the creation entry", async () => {
    await render();
    const input = host.querySelector("input");
    if (!input) throw new Error("Missing bot search");
    expect(document.activeElement).toBe(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "AD");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("Ada");
    expect(host.textContent).not.toContain("Doolittle");
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((entry) => entry.textContent?.includes("Create a new bot"))
        ?.click(),
    );
    expect(onCreate).toHaveBeenCalledOnce();
  });
  it("Escape closes and unmount restores launch focus", async () => {
    await render();
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(trigger);
    expect(trigger.inert).toBeFalsy();
  });
  it("exposes loading and retry failures without inventing a bot", async () => {
    await render(true);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Loading bots",
    );
    await render(false, "unavailable");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Try again",
    );
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("reports a conversation transition failure separately from catalog loading", async () => {
    await act(async () =>
      root.render(
        <NewChatChooser
          bots={bots}
          loading={false}
          error=""
          transitionError="This conversation could not be opened."
          onChoose={onChoose}
          onCreate={onCreate}
          onClose={onClose}
          onRetry={vi.fn()}
          returnFocusTarget={trigger}
        />,
      ),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Choose a bot to try again",
    );
    expect(host.textContent).not.toContain("Bots could not be loaded");
  });

  it("makes project access an explicit new-chat choice without a focus frame", async () => {
    const onScopeChange = vi.fn();
    await act(async () =>
      root.render(
        <NewChatChooser
          bots={bots}
          loading={false}
          error=""
          projects={[
            { id: "alpha", name: "Alpha", primaryPath: "/repo/alpha" },
            { id: "incomplete", name: "Incomplete" },
          ]}
          scope="unscoped"
          onScopeChange={onScopeChange}
          onChoose={onChoose}
          onCreate={onCreate}
          onClose={onClose}
          onRetry={vi.fn()}
          returnFocusTarget={trigger}
        />,
      ),
    );
    const select = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Project for new chat"]',
    );
    expect(select?.value).toBe("unscoped");
    expect(select?.textContent).toContain("Private scratch");
    expect(select?.textContent).toContain("Alpha");
    expect(select?.textContent).not.toContain("Incomplete");
    expect(select?.className).toContain("focus:outline-none");
    await act(async () => {
      if (!select) return;
      select.value = "alpha";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onScopeChange).toHaveBeenCalledWith("alpha");
  });
});

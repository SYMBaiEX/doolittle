// @vitest-environment jsdom
import type { BotSummary } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeStatus } from "../../shared/contracts";
import { desktopRequest } from "../lib";
import { BotCreationConversation } from "./BotCreationConversation";
import { botCharacterDraft } from "./bot-character-draft";

vi.mock("../lib", () => ({
  desktopRequest: vi.fn(),
  errorMessage: () => "Could not save this bot.",
}));

describe("conversational bot creation", () => {
  let host: HTMLDivElement;
  let root: Root;
  let raf: ReturnType<typeof vi.spyOn>;
  const onCreated = vi.fn();
  const onClose = vi.fn();
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    vi.mocked(desktopRequest).mockResolvedValue({
      providers: {
        offline: {
          accounts: [
            { accountId: "local", label: "Local test", enabled: true },
          ],
        },
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    await act(async () =>
      root.render(
        <BotCreationConversation
          onClose={onClose}
          onCreated={onCreated}
          runtime={{ provider: "offline", model: "test" } as RuntimeStatus}
          workspacePath="/workspace/original"
          projectId="project-original"
        />,
      ),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    raf.mockRestore();
  });
  const button = (text: string) =>
    [...host.querySelectorAll("button")].find(
      (entry) => entry.textContent?.trim() === text,
    );
  const change = async (
    input: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const interview = async () => {
    await act(async () => button("Research and writing")?.click());
    await act(async () =>
      button(
        "Clear and direct. Explain decisions and verify results.",
      )?.click(),
    );
    const answer = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Your answer"]',
    );
    if (!answer) throw new Error("Missing interview answer");
    await change(answer, "Ada");
    await act(async () =>
      host
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
  };
  const review = async () => {
    await interview();
    await act(async () => button("Review model and access")?.click());
  };

  it("starts inside the conversation, focuses the answer and validates empty replies", async () => {
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("textarea"));
    await act(async () =>
      host
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Type an answer",
    );
    expect(desktopRequest).toHaveBeenCalledTimes(1);
  });

  it("gathers answers and previews native character fields without pretending to generate a model answer", async () => {
    await interview();
    expect(host.textContent).toContain("Meet Ada");
    expect(host.textContent).toContain("This draft comes from your answers");
    expect(host.textContent).toContain(
      "native Eliza system, bio and style fields",
    );
    expect(desktopRequest).toHaveBeenCalledTimes(1);
  });

  it("creates a native sheet with stable captured scope and no automatic account or mutation grants", async () => {
    await review();
    const saved = { id: "ada", name: "Ada", state: "stopped" } as BotSummary;
    vi.mocked(desktopRequest).mockResolvedValueOnce(saved);
    expect(
      [
        ...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      ].every((entry) => !entry.checked),
    ).toBe(true);
    await act(async () => button("Create Ada")?.click());
    expect(desktopRequest).toHaveBeenLastCalledWith("/bots", "POST", {
      name: "Ada",
      character: botCharacterDraft(
        "Research and writing",
        "Clear and direct. Explain decisions and verify results.",
      ),
      model: { provider: "offline", model: "test" },
      workspacePath: "/workspace/original",
      projectId: "project-original",
      permissions: {
        connectionIds: [],
        workspacePaths: ["/workspace/original"],
        toolIds: [],
        allowMutation: false,
        allowDelegation: false,
      },
    });
    expect(onCreated).toHaveBeenCalledWith(saved);
  });

  it("keeps the draft and provides an actionable error when save fails", async () => {
    await review();
    vi.mocked(desktopRequest).mockRejectedValueOnce(
      new Error("private detail"),
    );
    await act(async () => button("Create Ada")?.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not save this bot.",
    );
    expect(host.textContent).toContain("Ada");
    expect(button("Create Ada")?.disabled).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("prevents duplicate same-render submissions and cancellation during save", async () => {
    await review();
    let resolveSave!: (bot: BotSummary) => void;
    vi.mocked(desktopRequest).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    await act(async () => {
      button("Create Ada")?.click();
      button("Create Ada")?.click();
    });
    expect(
      vi
        .mocked(desktopRequest)
        .mock.calls.filter((entry) => entry[0] === "/bots"),
    ).toHaveLength(1);
    expect(
      host.querySelector<HTMLButtonElement>(
        '[aria-label="Cancel bot creation"]',
      )?.disabled,
    ).toBe(true);
    await act(async () =>
      resolveSave({ id: "ada", name: "Ada" } as BotSummary),
    );
  });

  it("can revise the previous answer without granting access", async () => {
    await interview();
    await act(async () => button("Previous answer")?.click());
    expect(
      host.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Your answer"]',
      )?.value,
    ).toBe("Ada");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("reports unsaved answers to the host without sharing their contents", async () => {
    const onDirtyChange = vi.fn();
    await act(async () =>
      root.render(
        <BotCreationConversation
          onClose={onClose}
          onCreated={onCreated}
          onDirtyChange={onDirtyChange}
          runtime={null}
          workspacePath="/workspace/original"
        />,
      ),
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await act(async () => button("Research and writing")?.click());
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(
      onDirtyChange.mock.calls.every(
        (entry) => entry.length === 1 && typeof entry[0] === "boolean",
      ),
    ).toBe(true);
  });
});

// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPromptLibrary,
  PROMPT_LIBRARY_CHANGE_EVENT,
  savePromptLibrary,
} from "../conversation-persistence";
import { PromptLibrary } from "./PromptLibrary";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  },
});

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function PromptLibraryProbe({
  activeProject,
}: {
  activeProject?: { id: string; name: string } | null;
}) {
  const [draft, setDraft] = useState("Review this repository carefully.");
  const [announcement, setAnnouncement] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div>
      <textarea aria-label="Draft" ref={composerRef} value={draft} readOnly />
      <button onClick={() => setDraft("")} type="button">
        Clear draft
      </button>
      <PromptLibrary
        activeProject={activeProject}
        composerRef={composerRef}
        draft={draft}
        setAnnouncement={setAnnouncement}
        setDraft={setDraft}
      />
      <output aria-label="Announcement">{announcement}</output>
    </div>
  );
}

describe("PromptLibrary", () => {
  let container: HTMLDivElement;
  let root: Root;
  let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
  });

  afterEach(() => {
    act(() => root.unmount());
    requestAnimationFrameSpy.mockRestore();
    container.remove();
  });

  it("saves, renames, restores, and persists a reusable prompt", () => {
    act(() => root.render(<PromptLibraryProbe />));

    const promptsButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Prompts",
    );
    act(() => promptsButton?.click());

    const titleInput = container.querySelector<HTMLInputElement>(
      '[aria-label="Saved prompt title"]',
    );
    expect(titleInput).not.toBeNull();
    act(() => {
      if (titleInput) setInputValue(titleInput, "Repository review");
    });

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Save draft",
    );
    act(() => saveButton?.click());

    expect(loadPromptLibrary(localStorage)).toMatchObject([
      {
        title: "Repository review",
        content: "Review this repository carefully.",
      },
    ]);
    expect(container.textContent).toContain(
      "Saved “Repository review” to the prompt library.",
    );

    const renameButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Rename Repository review"]',
    );
    act(() => renameButton?.click());
    const renameInput = container.querySelector<HTMLInputElement>(
      '[aria-label="Rename Repository review"]',
    );
    act(() => {
      if (!renameInput) return;
      setInputValue(renameInput, "Deep repository review");
      renameInput.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });
    expect(loadPromptLibrary(localStorage)[0]?.title).toBe(
      "Deep repository review",
    );

    const clearButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Clear draft",
    );
    act(() => clearButton?.click());
    expect(
      container.querySelector<HTMLTextAreaElement>('[aria-label="Draft"]')
        ?.value,
    ).toBe("");

    const restoreButton = container.querySelector<HTMLButtonElement>(
      ".chat-prompt-library__restore",
    );
    act(() => restoreButton?.click());
    expect(
      container.querySelector<HTMLTextAreaElement>('[aria-label="Draft"]')
        ?.value,
    ).toBe("Review this repository carefully.");
    expect(document.activeElement).toBe(
      container.querySelector('[aria-label="Draft"]'),
    );
  });

  it("keeps project and general prompt scopes separate", () => {
    savePromptLibrary(localStorage, [
      {
        id: "project-prompt",
        title: "Project prompt",
        content: "Inspect this project.",
        projectId: "project-1",
        createdAt: "2026-08-12T10:00:00.000Z",
        updatedAt: "2026-08-12T10:00:00.000Z",
      },
      {
        id: "general-prompt",
        title: "General prompt",
        content: "Summarize this work.",
        createdAt: "2026-08-12T10:00:00.000Z",
        updatedAt: "2026-08-12T10:00:00.000Z",
      },
    ]);
    act(() =>
      root.render(
        <PromptLibraryProbe
          activeProject={{ id: "project-1", name: "Doolittle" }}
        />,
      ),
    );

    const promptsButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Prompts · 1",
    );
    act(() => promptsButton?.click());
    expect(container.textContent).toContain("Project prompt");
    expect(container.textContent).not.toContain("General prompt");

    const generalButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "General",
    );
    act(() => generalButton?.click());
    expect(container.textContent).toContain("General prompt");
    expect(container.textContent).not.toContain("Project prompt");
  });

  it("opens the full manager and restores focus when the quick panel closes", () => {
    savePromptLibrary(localStorage, [
      {
        id: "managed-prompt",
        title: "Managed prompt",
        content: "Inspect all managed prompts.",
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
      },
    ]);
    act(() => root.render(<PromptLibraryProbe />));

    const promptsButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Prompts · 1",
    );
    act(() => promptsButton?.click());
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    expect(container.querySelector("#chat-prompt-library")).toBeNull();
    expect(document.activeElement).toBe(promptsButton);

    act(() => promptsButton?.click());
    const manageButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Manage all"),
    );
    act(() => manageButton?.click());

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.textContent).toContain("Manage prompt library");
    expect(dialog?.textContent).toContain("Managed prompt");
    expect(dialog?.className).toContain("calc(100svh-40px)");
    expect(dialog?.className).not.toContain("calc(100vh-40px)");
    expect(document.activeElement).toBe(
      dialog?.querySelector('[aria-label="Search saved prompts"]'),
    );
  });

  it("reloads saved prompts from another window", () => {
    act(() => root.render(<PromptLibraryProbe />));
    expect(container.textContent).toContain("Prompts");

    savePromptLibrary(localStorage, [
      {
        id: "external-prompt",
        title: "External prompt",
        content: "Reload this prompt from storage.",
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
      },
    ]);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "doolittle.desktop.prompt-library.v1",
        }),
      );
    });

    const promptsButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Prompts · 1",
    );
    expect(promptsButton).toBeDefined();
    act(() => promptsButton?.click());
    expect(container.textContent).toContain("External prompt");
  });

  it("synchronizes same-window saves and storage clears", () => {
    act(() => root.render(<PromptLibraryProbe />));
    savePromptLibrary(localStorage, [
      {
        id: "same-window-prompt",
        title: "Same window prompt",
        content: "Refresh without opening another renderer.",
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
      },
    ]);
    act(() => window.dispatchEvent(new Event(PROMPT_LIBRARY_CHANGE_EVENT)));
    expect(container.textContent).toContain("Prompts · 1");

    localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(container.textContent).not.toContain("Prompts · 1");
  });

  it("restores the trigger when an outside click leaves focus orphaned", () => {
    act(() => root.render(<PromptLibraryProbe />));
    const promptsButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Prompts",
    );
    act(() => promptsButton?.click());
    const titleInput = container.querySelector<HTMLInputElement>(
      '[aria-label="Saved prompt title"]',
    );
    titleInput?.focus();

    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(container.querySelector("#chat-prompt-library")).toBeNull();
    expect(document.activeElement).toBe(promptsButton);
  });
});

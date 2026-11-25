// @vitest-environment jsdom

import { act, createRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createAutomationDraft } from "../../apps/desktop/src/renderer/automation-model";
import { AutomationBuilder } from "../../apps/desktop/src/renderer/automations/AutomationBuilder";
import { PromptLibrary } from "../../apps/desktop/src/renderer/chat/PromptLibrary";
import {
  apiResourceCacheKey,
  desktopQueryClient,
} from "../../apps/desktop/src/renderer/lib";
import { MediaLibraryTab } from "../../apps/desktop/src/renderer/media/MediaLibraryTab";

function mount(node: ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    dispose() {
      act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

function radios(group: Element | null) {
  return Array.from(
    group?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [],
  );
}

function enterKeyPrevented(input: HTMLInputElement | undefined) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  act(() => input?.dispatchEvent(event));
  return event.defaultPrevented;
}

it("exposes automation type choices as native radio groups", () => {
  const onUpdate = vi.fn();
  const view = mount(
    <AutomationBuilder
      draft={createAutomationDraft()}
      onSubmit={(event) => event.preventDefault()}
      onUpdate={onUpdate}
    />,
  );
  try {
    const trigger = view.container.querySelector(
      '[role="radiogroup"][aria-label="Choose a trigger"]',
    );
    const choices = radios(trigger);
    expect(choices.map((choice) => choice.value)).toEqual([
      "schedule",
      "manual",
      "webhook",
    ]);
    expect(choices[0]?.name).not.toBe("");
    expect(new Set(choices.map((choice) => choice.name)).size).toBe(1);
    expect(choices.find((choice) => choice.value === "schedule")?.checked).toBe(
      true,
    );
    expect(trigger?.querySelector("[aria-pressed]")).toBeNull();

    const manual = choices.find((choice) => choice.value === "manual");
    expect(enterKeyPrevented(manual)).toBe(true);
    act(() => manual?.click());
    expect(onUpdate).toHaveBeenCalledWith("triggerType", "manual");
  } finally {
    view.dispose();
  }
});

it("uses native radio groups for media scope and type filters", () => {
  const sessionId = "session-1";
  const path = `/media/library?${new URLSearchParams({ sessionId })}`;
  desktopQueryClient.setQueryData([apiResourceCacheKey(path, [])], {
    assets: [],
  });
  const view = mount(<MediaLibraryTab active sessionId={sessionId} />);
  try {
    const scope = view.container.querySelector(
      '[role="radiogroup"][aria-label="Asset scope"]',
    );
    const scopeChoices = radios(scope);
    expect(scopeChoices.map((choice) => choice.value)).toEqual(["chat", "all"]);
    expect(new Set(scopeChoices.map((choice) => choice.name)).size).toBe(1);
    expect(scopeChoices[0]?.checked).toBe(true);
    expect(scope?.querySelector("[aria-pressed]")).toBeNull();
    expect(enterKeyPrevented(scopeChoices[1])).toBe(true);

    act(() => scopeChoices[1]?.click());
    expect(scopeChoices[1]?.checked).toBe(true);

    const type = view.container.querySelector(
      '[role="radiogroup"][aria-label="Asset type"]',
    );
    const typeChoices = radios(type);
    expect(typeChoices.map((choice) => choice.value)).toEqual([
      "all",
      "image",
      "audio",
      "video",
    ]);
    expect(new Set(typeChoices.map((choice) => choice.name)).size).toBe(1);
    expect(typeChoices[0]?.checked).toBe(true);
    expect(type?.querySelector("[aria-pressed]")).toBeNull();

    act(() => typeChoices[1]?.click());
    expect(typeChoices[1]?.checked).toBe(true);
  } finally {
    view.dispose();
    desktopQueryClient.clear();
  }
});

it("uses native radio choices for prompt library scope", () => {
  window.localStorage.clear();
  const view = mount(
    <PromptLibrary
      activeProject={{ id: "project-1", name: "Project One" }}
      composerRef={createRef<HTMLTextAreaElement>()}
      draft=""
      setAnnouncement={vi.fn()}
      setDraft={vi.fn()}
    />,
  );
  try {
    act(() =>
      view.container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Open prompt library"]',
        )
        ?.click(),
    );
    const group = view.container.querySelector(
      '[role="radiogroup"][aria-label="Prompt library scope"]',
    );
    const choices = radios(group);
    expect(choices.map((choice) => choice.value)).toEqual([
      "project",
      "general",
    ]);
    expect(new Set(choices.map((choice) => choice.name)).size).toBe(1);
    expect(choices[0]?.checked).toBe(true);
    expect(group?.querySelector("[aria-pressed]")).toBeNull();
    expect(enterKeyPrevented(choices[1])).toBe(true);

    act(() => choices[1]?.click());
    expect(choices[1]?.checked).toBe(true);
  } finally {
    view.dispose();
    window.localStorage.clear();
  }
});

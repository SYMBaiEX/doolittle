// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PromptLibrary } from "../../apps/desktop/src/renderer/chat/PromptLibrary";

function PromptLibraryFixture() {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [, setAnnouncement] = useState("");
  return (
    <>
      <textarea ref={composerRef} />
      <button type="button">Outside</button>
      <PromptLibrary
        activeProject={null}
        composerRef={composerRef}
        draft={draft}
        namespace="test"
        setAnnouncement={setAnnouncement}
        setDraft={setDraft}
      />
    </>
  );
}

function keydown(key: string, shiftKey = false) {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    shiftKey,
  });
}

const settleFocus = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it("behaves as a non-modal popover for Tab and Escape", async () => {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() => root.render(<PromptLibraryFixture />));
    const opener = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open prompt library"]',
    );
    expect(opener).toBeDefined();
    await act(async () => {
      opener?.click();
      await settleFocus();
    });

    const panel = host.querySelector<HTMLElement>(
      '#chat-prompt-library-test[role="dialog"]',
    );
    expect(panel?.getAttribute("aria-modal")).toBe("false");
    const titleInput = host.querySelector<HTMLInputElement>(
      'input[aria-label="Saved prompt title"]',
    );
    expect(document.activeElement).toBe(titleInput);

    const forwardTab = keydown("Tab");
    act(() => {
      titleInput?.dispatchEvent(forwardTab);
    });
    expect(forwardTab.defaultPrevented).toBe(false);

    const outside = [...host.querySelectorAll("button")].find(
      (entry) => entry.textContent === "Outside",
    );
    await act(async () => {
      outside?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      outside?.focus();
      await settleFocus();
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(outside);

    await act(async () => {
      opener?.click();
      await settleFocus();
    });
    const reopenedTitleInput = host.querySelector<HTMLInputElement>(
      'input[aria-label="Saved prompt title"]',
    );
    expect(document.activeElement).toBe(reopenedTitleInput);
    await act(async () => {
      reopenedTitleInput?.dispatchEvent(keydown("Escape"));
      await settleFocus();
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});

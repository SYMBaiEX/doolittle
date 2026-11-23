// @vitest-environment jsdom

import { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommandPalette } from "../../apps/desktop/src/renderer/components/CommandPalette";
import { SettingsPage } from "../../apps/desktop/src/renderer/SettingsPage";
import { DESKTOP_SETTINGS_LANDING_EVENT } from "../../apps/desktop/src/renderer/settings/settings-sections";

let container: HTMLDivElement;
let root: Root;
const scrollIntoView = vi.fn();
const originalScroll = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("doolittle", {
    getLifecycleState: async () => ({ keepRunningInBackground: true }),
    getUpdateState: async () => ({
      phase: "unavailable",
      message: "Updates are unavailable in development.",
    }),
    onUpdateState: () => () => {},
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalScroll) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScroll,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});

async function render(section: "appearance" | "desktop") {
  await act(async () => {
    root.render(
      <SettingsPage
        active={false}
        onSectionChange={() => {}}
        section={section}
      />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

it("puts native Desktop controls before display preferences and the theme gallery while offline", async () => {
  await render("appearance");
  const headings = Array.from(
    container.querySelectorAll(".settings-category-panel h2"),
    (heading) => heading.textContent,
  );
  expect(headings).toEqual([
    "Desktop",
    "Display preferences",
    "Interface themes",
  ]);
  expect(
    container.querySelector<HTMLInputElement>(
      '[aria-label="Keep running in the background"]',
    )?.disabled,
  ).toBe(false);
  expect(document.activeElement?.getAttribute("aria-label")).not.toBe(
    "Desktop settings",
  );
  expect(scrollIntoView).not.toHaveBeenCalled();
});

it("lands directly on Desktop for initial and in-place deep links without stealing focus on preference changes", async () => {
  await render("desktop");
  const desktop = container.querySelector('[aria-label="Desktop settings"]');
  expect(document.activeElement).toBe(desktop);
  expect(scrollIntoView).not.toHaveBeenCalled();

  await render("appearance");
  const content = container.querySelector<HTMLElement>(".settings-content");
  const tabs = content?.querySelector<HTMLElement>('[role="tablist"]');
  expect(content).toBeTruthy();
  expect(tabs).toBeTruthy();
  if (tabs) tabs.style.top = "12px";
  if (content) content.style.paddingTop = "24px";
  vi.spyOn(desktop as HTMLElement, "getBoundingClientRect").mockReturnValue({
    top: 160,
  } as DOMRect);
  vi.spyOn(content as HTMLElement, "getBoundingClientRect").mockReturnValue({
    top: 20,
  } as DOMRect);
  vi.spyOn(tabs as HTMLElement, "getBoundingClientRect").mockReturnValue({
    height: 40,
  } as DOMRect);
  container.scrollTop = 50;
  const background = container.querySelector<HTMLInputElement>(
    '[aria-label="Keep running in the background"]',
  );
  background?.focus();
  await render("appearance");
  expect(document.activeElement).toBe(background);

  await render("desktop");
  expect(document.activeElement).toBe(desktop);
  expect(content?.scrollTop).toBe(64);
  expect(container.scrollTop).toBe(50);
  expect(scrollIntoView).not.toHaveBeenCalled();
});

it("returns to Desktop when its command repeats on the unchanged route", async () => {
  await render("desktop");
  const desktop = container.querySelector<HTMLElement>(
    '[aria-label="Desktop settings"]',
  );
  const content = container.querySelector<HTMLElement>(".settings-content");
  const background = container.querySelector<HTMLInputElement>(
    '[aria-label="Keep running in the background"]',
  );
  if (!desktop || !content || !background) throw new Error("Missing Desktop");
  vi.spyOn(desktop, "getBoundingClientRect").mockReturnValue({
    top: -400,
  } as DOMRect);
  content.scrollTop = 500;
  background.focus();
  await act(async () => {
    window.dispatchEvent(new Event(DESKTOP_SETTINGS_LANDING_EVENT));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
  expect(document.activeElement).toBe(desktop);
  expect(content.scrollTop).toBe(100);
});

function PaletteFocusFixture() {
  const [open, setOpen] = useState(false);
  const [landed, setLanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const destination = useRef<HTMLElement>(null);
  useEffect(() => {
    if (landed) destination.current?.focus();
  }, [landed]);
  return (
    <>
      <button ref={trigger} onClick={() => setOpen(true)} type="button">
        Open palette
      </button>
      <section aria-label="Destination" ref={destination} tabIndex={-1} />
      <CommandPalette
        groups={[
          {
            id: "settings",
            label: "Settings",
            items: [{ id: "desktop", label: "Desktop" }],
          },
        ]}
        isOpen={open}
        onClose={() => setOpen(false)}
        onCommandActivate={() => setLanded(true)}
        returnFocusTarget={trigger.current}
      />
    </>
  );
}

it("preserves a command's destination focus but still restores the palette trigger on cancel", async () => {
  await act(async () => root.render(<PaletteFocusFixture />));
  const trigger = container.querySelector("button");
  trigger?.focus();
  await act(async () => trigger?.click());
  await act(async () =>
    document.querySelector<HTMLElement>('[role="option"]')?.click(),
  );
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Destination",
  );

  trigger?.focus();
  await act(async () => trigger?.click());
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
  expect(document.activeElement).toBe(trigger);
});

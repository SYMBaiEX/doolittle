// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(),
}));

import { BotCreationConversation } from "../../apps/desktop/src/renderer/bots/BotCreationConversation";
import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";
import { desktopQueryClient } from "../../apps/desktop/src/renderer/lib";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { element: HTMLDivElement; root: Root }[] = [];

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.element.remove();
  }
  desktopQueryClient.clear();
  vi.mocked(desktopRequest).mockReset();
  vi.restoreAllMocks();
});

function mount() {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const entry = { element, root };
  mounted.push(entry);
  return entry;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function renderConversation(onClose: () => void) {
  const { element, root } = mount();
  act(() =>
    root.render(
      <BotCreationConversation
        onClose={onClose}
        onCreated={() => {}}
        runtime={null}
      />,
    ),
  );
  return element;
}

function mockMetadataRequests() {
  vi.mocked(desktopRequest).mockImplementation(async (path) => {
    if (path === "/runtime/account-pool") return { providers: {} };
    if (path.startsWith("/runtime/models")) return { providers: [] };
    throw new Error(`Unexpected request: ${path}`);
  });
}

function cancelButton(host: HTMLElement) {
  const button = host.querySelector<HTMLButtonElement>(
    '[aria-label="Cancel bot creation"]',
  );
  if (!button) throw new Error("Cancel button was not rendered.");
  return button;
}

function answerInput(host: HTMLElement) {
  const input = host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Your answer"]',
  );
  if (!input) throw new Error("Answer input was not rendered.");
  return input;
}

it("closes a pristine bot draft without confirmation", async () => {
  mockMetadataRequests();
  const onClose = vi.fn();
  const element = renderConversation(onClose);
  await flush();
  const confirm = vi.spyOn(window, "confirm");

  act(() => cancelButton(element).click());

  expect(onClose).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});

it("requires confirmation before canceling a dirty bot draft", async () => {
  mockMetadataRequests();
  const onClose = vi.fn();
  const element = renderConversation(onClose);
  await flush();
  const input = answerInput(element);
  const draft = "Research release risks and summarize the evidence.";
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(input, draft);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() =>
    element
      .querySelector<HTMLButtonElement>('[aria-label="Send answer"]')
      ?.click(),
  );
  expect(element.textContent).toContain(draft);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

  act(() => cancelButton(element).click());

  expect(onClose).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledExactlyOnceWith(
    "Discard this unsaved bot design?",
  );
  expect(element.textContent).toContain(draft);

  confirm.mockReturnValue(true);
  act(() => cancelButton(element).click());

  expect(onClose).toHaveBeenCalledOnce();
});

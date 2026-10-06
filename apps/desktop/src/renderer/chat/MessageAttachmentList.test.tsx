// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { copy } = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock("../context-menu-clipboard", () => ({ copyContextText: copy }));

import { MessageAttachmentList } from "./MessageAttachmentList";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const attachments = ["first", "second"].map((id) => ({
  id,
  name: `${id}.pdf`,
  kind: "document" as const,
  mimeType: "application/pdf",
  sizeBytes: 2048,
  sha256: `opaque-${id}`,
  botId: `bot-${id}`,
}));

describe("Message attachment context actions", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    copy.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  it("copies only the right-clicked attachment details and never private ownership/hash data", async () => {
    await act(async () =>
      root.render(<MessageAttachmentList attachments={attachments} />),
    );
    await act(async () =>
      container.querySelectorAll("strong")[1]?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    await act(async () =>
      [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent === "Copy attachment details")
        ?.click(),
    );
    expect(copy).toHaveBeenCalledExactlyOnceWith("second.pdf\ndocument\n2 KB");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });
  it("exposes the identical actions through its named overflow control and closes on target removal", async () => {
    await act(async () =>
      root.render(<MessageAttachmentList attachments={attachments} />),
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="Actions for attachment second.pdf"]',
    );
    await act(async () => button?.click());
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () =>
      root.render(<MessageAttachmentList attachments={[attachments[0]]} />),
    );
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(copy).not.toHaveBeenCalled();
  });
});

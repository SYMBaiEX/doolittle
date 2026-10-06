// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { request, copy } = vi.hoisted(() => ({
  request: vi.fn(),
  copy: vi.fn(),
}));
vi.mock("../lib", async () => ({
  ...(await vi.importActual<typeof import("../lib")>("../lib")),
  desktopRequest: request,
}));
vi.mock("../context-menu-clipboard", () => ({ copyContextText: copy }));

import { ArtifactViewer } from "./ArtifactViewer";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("ArtifactViewer", () => {
  it("renders a compact Tailwind-only artifact disclosure", () => {
    const markup = renderToStaticMarkup(
      <ArtifactViewer
        artifacts={[{ index: 0, name: "release.diff" }]}
        runId="run-1"
      />,
    );

    expect(markup).toContain("release.diff");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(markup).not.toContain("artifact-viewer");
  });

  it("copies only loaded text and does not remount a loaded HTML preview when its menu opens", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    request.mockResolvedValue({
      artifact: {
        runId: "run-1",
        index: 0,
        name: "preview.html",
        kind: "html",
        mimeType: "text/html",
        sizeBytes: 20,
      },
      encoding: "utf8",
      content: "<p>Preview</p>",
    });
    const openMenu = async () => {
      await act(async () =>
        container.querySelector("button")?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
          }),
        ),
      );
      return [
        ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      ];
    };
    try {
      await act(async () =>
        root.render(
          <ArtifactViewer
            artifacts={[{ index: 0, name: "preview.html" }]}
            runId="run-1"
          />,
        ),
      );
      let items = await openMenu();
      expect(
        items
          .find((item) => item.textContent === "Copy artifact contents")
          ?.getAttribute("aria-disabled"),
      ).toBe("true");
      await act(async () =>
        items.find((item) => item.textContent === "Expand artifact")?.click(),
      );
      const frame = container.querySelector("iframe");
      expect(frame).not.toBeNull();
      expect(request).toHaveBeenCalledExactlyOnceWith(
        "/codegen/runs/run-1/artifacts/0",
      );
      items = await openMenu();
      await act(async () =>
        items
          .find((item) => item.textContent === "Copy artifact contents")
          ?.click(),
      );
      expect(copy).toHaveBeenCalledExactlyOnceWith("<p>Preview</p>");
      expect(container.querySelector("iframe")).toBe(frame);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});

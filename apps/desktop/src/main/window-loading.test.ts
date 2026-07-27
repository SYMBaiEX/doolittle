import { describe, expect, it } from "bun:test";
import { type DesktopWindowLoader, loadDesktopWindow } from "./window-loading";

function fakeWindow(
  events: string[],
  options: { emitReadyDuringLoad?: boolean } = {
    emitReadyDuringLoad: true,
  },
): DesktopWindowLoader {
  let ready: (() => void) | undefined;
  return {
    once: (_event, listener) => {
      events.push("listen");
      ready = listener;
    },
    loadFile: async () => {
      events.push("load-file");
      if (options.emitReadyDuringLoad) ready?.();
    },
    loadURL: async () => {
      events.push("load-url");
      if (options.emitReadyDuringLoad) ready?.();
    },
    maximize: () => events.push("maximize"),
    show: () => events.push("show"),
    focus: () => events.push("focus"),
  };
}

describe("loadDesktopWindow", () => {
  it("subscribes before a packaged file can emit ready-to-show", async () => {
    const events: string[] = [];

    await loadDesktopWindow(fakeWindow(events), {
      rendererFile: "/app/renderer/index.html",
      startMaximized: false,
    });

    expect(events).toEqual(["listen", "load-file", "show", "focus"]);
  });

  it("restores a maximized development window before revealing it", async () => {
    const events: string[] = [];

    await loadDesktopWindow(fakeWindow(events), {
      rendererFile: "/app/renderer/index.html",
      rendererUrl: "http://127.0.0.1:5173",
      startMaximized: true,
    });

    expect(events).toEqual(["listen", "load-url", "maximize", "show", "focus"]);
  });

  it("reveals after loading when Electron does not emit ready-to-show", async () => {
    const events: string[] = [];

    await loadDesktopWindow(
      fakeWindow(events, { emitReadyDuringLoad: false }),
      {
        rendererFile: "/app/renderer/index.html",
        startMaximized: false,
      },
    );

    expect(events).toEqual(["listen", "load-file", "show", "focus"]);
  });
});

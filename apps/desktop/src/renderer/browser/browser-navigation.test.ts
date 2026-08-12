import { describe, expect, it } from "vitest";
import {
  browserNavigationReducer,
  INITIAL_BROWSER_NAVIGATION,
  isLocalPreviewUrl,
  normalizeBrowserUrl,
} from "./browser-navigation";

describe("browser navigation model", () => {
  it("normalizes safe HTTP URLs and rejects unsupported or sensitive inputs", () => {
    expect(normalizeBrowserUrl(" localhost:3000 ")).toBe(
      "http://localhost:3000/",
    );
    expect(normalizeBrowserUrl("https://example.test/path")).toBe(
      "https://example.test/path",
    );
    expect(() => normalizeBrowserUrl("ftp://example.test")).toThrow(
      "Only HTTP and HTTPS",
    );
    expect(() =>
      normalizeBrowserUrl("https://user:secret@example.test"),
    ).toThrow("embedded credentials");
    expect(() => normalizeBrowserUrl("https://example.test/\u0000bad")).toThrow(
      "valid URL",
    );
  });

  it("keeps local embedding restricted to exact loopback hosts", () => {
    expect(isLocalPreviewUrl("http://localhost:3000")).toBe(true);
    expect(isLocalPreviewUrl("https://127.0.0.1:8443")).toBe(true);
    expect(isLocalPreviewUrl("http://localhost.example.test")).toBe(false);
    expect(isLocalPreviewUrl("http://[::1]:3000")).toBe(false);
  });

  it("branches history from the current entry without stale render state", () => {
    const first = browserNavigationReducer(INITIAL_BROWSER_NAVIGATION, {
      type: "show-url",
      url: "http://one.test/",
      recordHistory: true,
    });
    const second = browserNavigationReducer(first, {
      type: "show-url",
      url: "http://two.test/",
      recordHistory: true,
    });
    const back = browserNavigationReducer(second, {
      type: "travel",
      direction: -1,
    });
    const branch = browserNavigationReducer(back, {
      type: "show-url",
      url: "http://three.test/",
      recordHistory: true,
    });

    expect(branch.history).toEqual(["http://one.test/", "http://three.test/"]);
    expect(branch.historyIndex).toBe(1);
    expect(branch.currentUrl).toBe("http://three.test/");
  });

  it("caps history and does not duplicate the current URL", () => {
    let state = INITIAL_BROWSER_NAVIGATION;
    for (let index = 0; index < 30; index += 1) {
      state = browserNavigationReducer(state, {
        type: "show-url",
        url: `http://example.test/${index}`,
        recordHistory: true,
      });
    }
    const duplicate = browserNavigationReducer(state, {
      type: "show-url",
      url: state.currentUrl,
      recordHistory: true,
    });

    expect(state.history).toHaveLength(25);
    expect(state.history[0]).toBe("http://example.test/5");
    expect(duplicate.history).toBe(state.history);
    expect(duplicate.historyIndex).toBe(24);
  });
});

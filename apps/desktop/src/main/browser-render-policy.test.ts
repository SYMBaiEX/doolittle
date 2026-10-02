import { describe, expect, it } from "vitest";
import {
  allowRenderResource,
  managedRenderUrl,
  renderViewport,
} from "./browser-render-policy";

describe("capture-only browser policy", () => {
  it("allows explicit local app URLs and bounded desktop/mobile viewports", () => {
    expect(managedRenderUrl("http://127.0.0.1:3000/story").origin).toBe(
      "http://127.0.0.1:3000",
    );
    expect(managedRenderUrl("http://localhost:4000/").port).toBe("4000");
    expect(managedRenderUrl("http://[::1]:5173/").port).toBe("5173");
    expect(renderViewport({})).toEqual({ width: 1280, height: 720 });
    expect(renderViewport({ width: 390, height: 844 })).toEqual({
      width: 390,
      height: 844,
    });
  });
  it.each([
    "https://example.com:3000/",
    "http://127.0.0.1/",
    "file:///private/page.html",
    "http://secret:password@localhost:3000/",
    "http://localhost:3000/%0a",
    "http://localhost:3000/\n",
    "not-a-url",
  ])("rejects unsupported URL %s", (url) => {
    expect(() => managedRenderUrl(url)).toThrow();
  });
  it.each([
    { width: 0 },
    { height: 1441 },
    { width: 1.5 },
    { width: "390" },
    { width: 2000 },
  ])("rejects unbounded viewport", (viewport) => {
    expect(() => renderViewport(viewport)).toThrow();
  });
  const target = new URL("http://127.0.0.1:3000/");
  it.each([
    ["http://127.0.0.1:3000/app.js", "GET", "script", true],
    ["http://127.0.0.1:3000/submit", "POST", "xhr", false],
    ["http://127.0.0.1:4000/private", "GET", "xhr", false],
    ["http://169.254.169.254/latest", "GET", "image", false],
    ["https://example.com/frame", "GET", "mainFrame", false],
    ["https://fonts.googleapis.com/css2", "GET", "stylesheet", true],
    ["https://images.unsplash.com/photo", "GET", "image", true],
    ["https://images.unsplash.com/frame", "GET", "subFrame", false],
    ["http://images.unsplash.com/photo", "GET", "image", false],
    ["https://private:secret@images.unsplash.com/photo", "GET", "image", false],
    ["ws://127.0.0.1:3000/hmr", "GET", "webSocket", true],
    ["data:image/png;base64,fixture", "GET", "image", true],
    ["https://random.local/private", "GET", "image", false],
  ])("bounds resource %s %s", (url, method, resourceType, allowed) => {
    expect(allowRenderResource(target, { url, method, resourceType })).toBe(
      allowed,
    );
  });
});

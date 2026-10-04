// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { describe, expect, it, vi } from "vitest";
import type { ApiResource } from "../lib";
import { ResourceStatusBar } from "./ResourceStatusBar";

function resource(
  fields: Partial<ApiResource<unknown>> = {},
): ApiResource<unknown> {
  return {
    data: { ok: true },
    error: "",
    loading: false,
    reload: vi.fn(),
    status: "ready",
    hasData: true,
    ...fields,
  };
}

describe("ResourceStatusBar", () => {
  it("preserves its wrapped count row without shrinking in a short flex page", async () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <ResourceStatusBar
        resources={[
          { label: "runtime", resource: resource() },
          { label: "optional", required: false, resource: resource() },
        ]}
      />,
    );
    const bar = host.querySelector(".resource-status-bar");
    const counts = host.querySelector(".resource-status-bar__counts");
    expect(bar?.classList.contains("shrink-0")).toBe(true);
    expect(bar?.classList.contains("flex-wrap")).toBe(true);
    expect(counts?.textContent).toBe("1/1 required · 1/1 optional");
    expect(counts?.classList.contains("max-[640px]:basis-full")).toBe(true);

    const compiler = await compile("@tailwind utilities;");
    const css = compiler.build(["shrink-0", "max-[640px]:basis-full"]);
    expect(css).toMatch(/\.shrink-0 \{\s+flex-shrink: 0;/u);
    expect(css).toContain("@media (width < 640px)");
    expect(css).toContain("flex-basis: 100%");
  });

  it("renders an accessible SSR status and fans retry out to every resource", () => {
    const reloadA = vi.fn();
    const reloadB = vi.fn();
    const html = renderToStaticMarkup(
      <ResourceStatusBar
        resources={[
          {
            label: "runtime",
            resource: resource({
              reload: reloadA,
              status: "error",
              error: "down",
            }),
          },
          {
            label: "optional",
            required: false,
            resource: resource({
              reload: reloadB,
              status: "error",
              error: "down",
            }),
          },
        ]}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Retry");
    expect(html).toContain("Partially available");

    // The callback is deliberately exposed by the component's button; SSR does not execute it.
    expect(reloadA).not.toHaveBeenCalled();
    expect(reloadB).not.toHaveBeenCalled();
  });

  it("does not show retry for healthy cached data", () => {
    const html = renderToStaticMarkup(
      <ResourceStatusBar
        resources={[{ label: "runtime", resource: resource() }]}
      />,
    );
    expect(html).toContain("Ready");
    expect(html).not.toContain("Retry");
  });

  it("fans retry out to required and optional resources", () => {
    const reloadA = vi.fn();
    const reloadB = vi.fn();
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() =>
      root.render(
        <ResourceStatusBar
          resources={[
            {
              label: "runtime",
              resource: resource({
                reload: reloadA,
                status: "error",
                error: "down",
              }),
            },
            {
              label: "optional",
              required: false,
              resource: resource({
                reload: reloadB,
                status: "error",
                error: "down",
              }),
            },
          ]}
        />,
      ),
    );
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    expect(reloadA).toHaveBeenCalledOnce();
    expect(reloadB).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("only retries failed resources and uses an alert when required data is absent", () => {
    const reloadReady = vi.fn();
    const reloadFailed = vi.fn();
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() =>
      root.render(
        <ResourceStatusBar
          resources={[
            {
              label: "ready",
              required: false,
              resource: resource({ reload: reloadReady }),
            },
            {
              label: "failed",
              resource: resource({
                data: null,
                hasData: false,
                reload: reloadFailed,
                status: "error",
                error: "down",
              }),
            },
          ]}
        />,
      ),
    );
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    expect(reloadFailed).toHaveBeenCalledOnce();
    expect(reloadReady).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useGlobalSearch } from "../../apps/desktop/src/renderer/global-search";
import * as rendererTransport from "../../apps/desktop/src/renderer/lib";

function deferredSearch() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function SearchProbe({
  query,
  workspace,
}: {
  query: string;
  workspace: string;
}) {
  const search = useGlobalSearch(query, true, workspace);
  return <output>{JSON.stringify(search)}</output>;
}

it("publishes available project sources while slow search requests remain pending", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const slow = deferredSearch();
  const stale = deferredSearch();
  const request = vi
    .spyOn(rendererTransport, "desktopRequest")
    .mockImplementation((path) => {
      if (path.startsWith("/projects?")) {
        return Promise.resolve({
          projects: [
            {
              id: "project",
              name: "Project",
              resources: [
                {
                  id: "note",
                  kind: "note",
                  label: "Available project source",
                  value: "First fixture",
                },
              ],
            },
          ],
        });
      }
      if (path.startsWith("/workspace/search?")) return slow.promise;
      if (path.startsWith("/logs?") && path.includes("Available"))
        return stale.promise;
      return Promise.resolve({});
    });
  const host = document.createElement("div");
  const root = createRoot(host);
  const readSearch = () => JSON.parse(host.textContent ?? "");

  try {
    await act(async () =>
      root.render(<SearchProbe query="Available" workspace="/first" />),
    );
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(readSearch()).toMatchObject({
      loading: true,
      results: [{ id: "project-source:project:note" }],
    });

    const oldSignal = request.mock.calls.find(([path]) =>
      path.startsWith("/logs?"),
    )?.[3];
    await act(async () =>
      root.render(<SearchProbe query="Different" workspace="/second" />),
    );
    expect(oldSignal?.aborted).toBe(true);
    expect(readSearch()).toMatchObject({ loading: true, results: [] });
    await act(async () => {
      stale.resolve({ logs: [{ id: "old", message: "Old result" }] });
      slow.reject(new Error("Workspace search unavailable"));
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(readSearch()).toMatchObject({
      loading: false,
      results: [],
      error: "Some local search sources are unavailable (1/5).",
    });
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

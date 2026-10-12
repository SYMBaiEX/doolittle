// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResource } from "../lib";
import { useBotCatalogPolling } from "./useBotCatalogPolling";

const { interval } = vi.hoisted(() => ({ interval: vi.fn() }));
vi.mock("@elizaos/ui/hooks/useDocumentVisibility", () => ({
  useIntervalWhenDocumentVisible: interval,
}));

type PollResource = Pick<
  ApiResource<unknown>,
  "loading" | "status" | "isValidating" | "reload"
>;

function Probe({
  backendReady,
  resource,
}: {
  backendReady: boolean;
  resource: PollResource;
}) {
  useBotCatalogPolling(backendReady, resource);
  return null;
}

describe("bot catalog polling", () => {
  let host: HTMLDivElement;
  let root: Root;
  const reload = vi.fn();
  const render = (backendReady: boolean, resource: PollResource) => {
    act(() =>
      root.render(<Probe backendReady={backendReady} resource={resource} />),
    );
    const [tick, delay, enabled] = interval.mock.lastCall as [
      () => void,
      number,
      boolean,
    ];
    expect(delay).toBe(5_000);
    return { tick, enabled };
  };

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    interval.mockReset();
    reload.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("recovers from an initial error without a backend phase change", () => {
    const failed: PollResource = {
      loading: false,
      status: "error",
      isValidating: false,
      reload,
    };
    const first = render(true, failed);
    expect(first.enabled).toBe(true);
    act(first.tick);
    expect(reload).toHaveBeenCalledTimes(1);

    const recovered = render(true, { ...failed, status: "ready" });
    expect(recovered.enabled).toBe(true);
    act(recovered.tick);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not poll when the backend is paused or offline", () => {
    const resource: PollResource = {
      loading: false,
      status: "error",
      isValidating: false,
      reload,
    };
    expect(render(false, resource).enabled).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("skips an in-flight initial load or revalidation", () => {
    const resource: PollResource = {
      loading: true,
      status: "loading",
      isValidating: true,
      reload,
    };
    act(render(true, resource).tick);
    act(
      render(true, { ...resource, loading: false, status: "refreshing" }).tick,
    );
    act(render(true, { ...resource, loading: false, status: "error" }).tick);
    expect(reload).not.toHaveBeenCalled();
  });
});

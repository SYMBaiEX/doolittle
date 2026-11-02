// @vitest-environment jsdom

import { ApiError } from "@elizaos/ui/api/client-types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(),
}));

import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";
import {
  desktopQueryClient,
  useApiResource,
} from "../../apps/desktop/src/renderer/lib";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  desktopQueryClient.clear();
  vi.mocked(desktopRequest).mockReset();
});
function View({ bot, enabled = true }: { bot: string; enabled?: boolean }) {
  const resource = useApiResource<{ owner: string }>(
    enabled ? "/api/status" : null,
    [],
    bot,
  );
  return (
    <div>
      <span>{resource.data?.owner ?? resource.status}</span>
      <button type="button" onClick={resource.reload}>
        Reload
      </button>
      <small>{resource.error}</small>
    </div>
  );
}
function mount() {
  const element = document.createElement("div");
  const root = createRoot(element);
  roots.push(root);
  return { element, root };
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

it("deduplicates consumers and retains the shared request when one unmounts", async () => {
  let finish: (value: { owner: string }) => void = () => {};
  vi.mocked(desktopRequest).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve as typeof finish;
      }),
  );
  const a = mount();
  const b = mount();
  act(() => {
    a.root.render(<View bot="a" />);
    b.root.render(<View bot="a" />);
  });
  expect(desktopRequest).toHaveBeenCalledOnce();
  act(() => a.root.render(null));
  await act(async () => {
    finish({ owner: "a" });
  });
  await flush();
  expect(b.element.textContent).toContain("aReload");
  expect(desktopRequest).toHaveBeenCalledOnce();
});
it("keeps bot responses isolated during a pending context switch", async () => {
  const pending = new Map<string, (value: { owner: string }) => void>();
  vi.mocked(desktopRequest).mockImplementation(
    (_path, _method, _body, _signal, _timeout, bot) =>
      new Promise((resolve) => {
        pending.set(bot ?? "", resolve as (value: { owner: string }) => void);
      }),
  );
  const { element, root } = mount();
  act(() => root.render(<View bot="a" />));
  act(() => root.render(<View bot="b" />));
  await act(async () => {
    pending.get("a")?.({ owner: "old-a" });
    pending.get("b")?.({ owner: "new-b" });
  });
  await flush();
  expect(element.textContent).toContain("new-b");
  expect(element.textContent).not.toContain("old-a");
});
it("retains useful data on reload failure and leaves disabled resources idle", async () => {
  vi.mocked(desktopRequest)
    .mockResolvedValueOnce({ owner: "saved" })
    .mockRejectedValueOnce(new Error("temporarily offline"));
  const { element, root } = mount();
  act(() => root.render(<View bot="a" enabled={false} />));
  expect(desktopRequest).not.toHaveBeenCalled();
  act(() => root.render(<View bot="a" />));
  await flush();
  act(() => element.querySelector("button")?.click());
  await flush();
  expect(element.textContent).toContain("saved");
  expect(element.textContent).toContain("temporarily offline");
  expect(desktopRequest).toHaveBeenCalledTimes(2);
});

it("recovers one transient read failure while retaining the current resource", async () => {
  vi.mocked(desktopRequest)
    .mockResolvedValueOnce({ owner: "saved" })
    .mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        path: "/api/status",
        status: 503,
        message: "Status temporarily unavailable",
      }),
    )
    .mockResolvedValueOnce({ owner: "fresh" });
  const { element, root } = mount();
  act(() => root.render(<View bot="a" />));
  await flush();
  act(() => element.querySelector("button")?.click());
  await flush();
  expect(element.textContent).toContain("saved");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  await flush();
  expect(element.textContent).toContain("fresh");
  expect(desktopRequest).toHaveBeenCalledTimes(3);
});

it("does not retry a read rejected by authorization", async () => {
  vi.mocked(desktopRequest).mockRejectedValue(
    new ApiError({
      kind: "http",
      path: "/api/status",
      status: 403,
      message: "Access denied",
    }),
  );
  const { element, root } = mount();
  act(() => root.render(<View bot="a" />));
  await flush();
  expect(element.textContent).toContain("Access denied");
  expect(desktopRequest).toHaveBeenCalledOnce();
});

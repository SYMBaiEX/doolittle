import type { UiHostEvent } from "@doolittle/contracts/ui-host";
import { AgUiHostAdapter } from "@doolittle/ui/ag-ui";
import { describe, expect, it, vi } from "vitest";
import type { DesktopUiInterfaceBridge } from "../../shared/ui-interface";
import { NativeUiHost } from "./native-ui-host";

function setup() {
  let eventListener!: (event: {
    subscriptionId: string;
    value: UiHostEvent;
  }) => void;
  let acknowledged!: () => void;
  let rejected!: (error: Error) => void;
  let id = "";
  const detach = vi.fn();
  const bridge = {
    getSnapshot: vi.fn(),
    dispatch: vi.fn(),
    onEvent: vi.fn((listener) => {
      eventListener = listener;
      return detach;
    }),
    subscribe: vi.fn((value) => {
      id = value;
      return new Promise<void>((resolve, reject) => {
        acknowledged = resolve;
        rejected = reject;
      });
    }),
    unsubscribe: vi.fn(async () => undefined),
  } satisfies Partial<DesktopUiInterfaceBridge>;
  const host = new NativeUiHost(bridge as DesktopUiInterfaceBridge);
  return {
    host,
    bridge,
    detach,
    acknowledge: () => acknowledged(),
    reject: (error: Error) => rejected(error),
    emit: (sequence: number) =>
      eventListener({
        subscriptionId: id,
        value: {
          type: "run.state",
          target: { botId: "bot-1", sessionId: "session-1" },
          runId: "run-1",
          state: "running",
          sequence,
        },
      }),
  };
}

describe("native renderer UiHost transport", () => {
  it("installs the observer before IPC and accepts replay before acknowledgement", async () => {
    const { host, bridge, acknowledge, emit, detach } = setup();
    const receive = vi.fn();
    const unsubscribe = host.subscribe(receive, 4);
    emit(5);
    emit(5);
    emit(6);
    expect(receive.mock.calls.map(([event]) => event.sequence)).toEqual([5, 6]);
    expect(bridge.onEvent.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.subscribe.mock.invocationCallOrder[0] ?? 0,
    );
    acknowledge();
    await unsubscribe.ready;
    unsubscribe();
    emit(7);
    expect(detach).toHaveBeenCalledOnce();
    expect(bridge.dispatch).not.toHaveBeenCalled();
  });

  it("does not submit AG-UI work before subscription installation succeeds", async () => {
    const { host, bridge, reject } = setup();
    const adapter = new AgUiHostAdapter(host);
    const pending = adapter.submit(
      {
        threadId: "session-1",
        runId: "run-1",
        messages: [{ id: "m1", role: "user", content: "hello" }],
      },
      { botId: "bot-1", sessionId: "session-1" },
    );
    expect(bridge.dispatch).not.toHaveBeenCalled();
    reject(new Error("Cursor no longer available."));
    await expect(pending).rejects.toThrow(/Cursor/u);
    expect(bridge.dispatch).not.toHaveBeenCalled();
  });

  it("cleans up a subscription closed before acknowledgement without stopping work", async () => {
    const { host, bridge, acknowledge, detach } = setup();
    const unsubscribe = host.subscribe(vi.fn());
    host.dispose();
    acknowledge();
    await unsubscribe.ready;
    expect(detach).toHaveBeenCalledOnce();
    expect(bridge.unsubscribe).toHaveBeenCalledTimes(2);
    expect(bridge.dispatch).not.toHaveBeenCalled();
  });
});

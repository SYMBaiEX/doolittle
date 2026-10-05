import type { UiHostV1, UiTarget } from "@doolittle/contracts/ui-host";
import { describe, expect, it, vi } from "vitest";
import { NativeDraftBridge } from "./native-draft-bridge";

const target: UiTarget = { botId: "bot", sessionId: "chat" };
function setup(existing?: string) {
  let revision = 0;
  let canonical = existing;
  const apply = vi.fn((_target, _text) => {
    revision++;
  });
  const dispatch = vi.fn<UiHostV1["dispatch"]>(async (command) => {
    if (command.type === "draft.read")
      return {
        requestId: "read",
        accepted: true,
        draft: {
          target,
          text: canonical ?? "",
          exists: canonical !== undefined,
        },
      };
    if (command.type === "draft.update") {
      canonical = command.text;
      return { requestId: "write", accepted: true };
    }
    throw new Error("Unexpected command");
  });
  const bind = vi.fn(async () => undefined);
  const bridge = new NativeDraftBridge({
    host: { version: 1, dispatch, getSnapshot: vi.fn(), subscribe: vi.fn() },
    bind,
    revision: () => revision,
    apply,
  });
  return {
    bridge,
    bind,
    dispatch,
    apply,
    setRevision: (value: number) => {
      revision = value;
    },
    canonical: () => canonical,
  };
}
describe("host-backed native drafts", () => {
  it("adopts an existing host draft without writing or sending a message", async () => {
    const { bridge, apply, dispatch } = setup("host draft");
    await bridge.sync(target, "stale local draft", 0);
    expect(apply).toHaveBeenCalledWith(target, "host draft");
    expect(dispatch.mock.calls.map(([command]) => command.type)).toEqual([
      "draft.read",
    ]);
  });
  it("migrates an unsent local draft only after native ownership binding", async () => {
    const { bridge, bind, dispatch, canonical } = setup();
    await bridge.sync(target, "local draft", 0);
    expect(canonical()).toBe("local draft");
    expect(bind.mock.invocationCallOrder[0]).toBeLessThan(
      dispatch.mock.invocationCallOrder[0] ?? 0,
    );
    expect(dispatch.mock.calls.map(([command]) => command.type)).toEqual([
      "draft.read",
      "draft.update",
    ]);
  });
  it("skips a stale queued revision rather than overwriting newer edits", async () => {
    const { bridge, setRevision, canonical } = setup();
    const old = bridge.sync(target, "old", 0);
    setRevision(1);
    const latest = bridge.sync(target, "new", 1);
    await Promise.all([old, latest]);
    expect(canonical()).toBe("new");
  });
  it("keeps the captured bot target when a refresh arrives from another presentation", async () => {
    const { bridge, dispatch, apply } = setup("shared draft");
    await bridge.refresh(target);
    expect(dispatch).toHaveBeenCalledWith({ type: "draft.read", target });
    expect(apply).toHaveBeenCalledWith(target, "shared draft");
  });
});

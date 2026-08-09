import { describe, expect, it } from "vitest";
import { desktopIpcChannels, desktopIpcInvokeChannels } from "./ipc-channels";

describe("desktop IPC channels", () => {
  it("keeps every invoke channel unique and registered", () => {
    const invokeChannels = Object.values(desktopIpcChannels.invoke);

    expect(new Set(invokeChannels).size).toBe(invokeChannels.length);
    expect(desktopIpcInvokeChannels).toEqual(invokeChannels);
  });

  it("keeps event channels unique and separate from invoke channels", () => {
    const invokeChannels = new Set<string>(desktopIpcInvokeChannels);
    const eventChannels = Object.values(desktopIpcChannels.event);

    expect(new Set(eventChannels).size).toBe(eventChannels.length);
    expect(eventChannels.every((channel) => !invokeChannels.has(channel))).toBe(
      true,
    );
  });
});

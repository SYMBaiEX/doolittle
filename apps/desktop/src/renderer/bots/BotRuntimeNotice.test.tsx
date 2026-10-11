// @vitest-environment jsdom
import type { BotSummary } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotRuntimeNotice } from "./BotRuntimeNotice";

const bot = {
  id: "named-bot",
  name: "Jerry",
  state: "stopped",
} as BotSummary;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("BotRuntimeNotice", () => {
  it("describes stopped bots as on demand and offers an optional start fallback", async () => {
    const onStart = vi.fn(async () => {});
    act(() => root.render(<BotRuntimeNotice bot={bot} onStart={onStart} />));
    expect(host.textContent).toContain(
      "starts on demand for approved requests",
    );
    expect(host.textContent).toContain("Your draft is retained");
    expect(host.textContent).not.toContain("Activate");
    await act(async () => host.querySelector("button")?.click());
    expect(host.querySelector("button")?.textContent).toBe("Start now");
    expect(onStart).toHaveBeenCalledWith("named-bot");
  });

  it("waits through startup without suggesting another activation", () => {
    act(() =>
      root.render(<BotRuntimeNotice bot={{ ...bot, state: "starting" }} />),
    );
    expect(host.textContent).toContain("is starting in the shared engine");
    expect(host.textContent).toContain("draft is retained until it is ready");
    expect(host.querySelector("button")).toBeNull();
  });

  it("makes failed startup visible with a retry fallback", async () => {
    const onStart = vi.fn(async () => {});
    act(() =>
      root.render(
        <BotRuntimeNotice
          bot={{
            ...bot,
            state: "error",
            error: "Approved access is unavailable.",
          }}
          onStart={onStart}
        />,
      ),
    );
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain("could not start");
    expect(host.textContent).toContain("Approved access is unavailable.");
    expect(host.querySelector("button")?.textContent).toBe("Retry start");
    await act(async () => host.querySelector("button")?.click());
    expect(onStart).toHaveBeenCalledWith("named-bot");
  });
});

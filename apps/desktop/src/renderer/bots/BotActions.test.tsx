// @vitest-environment jsdom
import type { BotSummary } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib", () => ({
  desktopRequest: request,
  errorMessage: (value: unknown) => String(value),
}));

import { BotActions } from "./BotActions";

const bot = {
  id: "specialist",
  name: "Researcher",
  state: "busy",
  isDefault: false,
} as BotSummary;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  request.mockReset().mockResolvedValue({});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const button = (label: string) =>
  [...host.querySelectorAll("button")].find(
    (entry) => entry.textContent === label,
  );
it("stops only the selected bot and makes editing wait until it is stopped", async () => {
  act(() => root.render(<BotActions bot={bot} />));
  expect(button("Edit bot")?.disabled).toBe(true);
  await act(async () => button("Stop bot")?.click());
  expect(request).toHaveBeenCalledWith("/bots/specialist/stop", "POST");
  const receive = vi.fn();
  window.addEventListener("doolittle:edit-bot", receive);
  try {
    act(() => root.render(<BotActions bot={{ ...bot, state: "stopped" }} />));
    act(() => button("Edit bot")?.click());
    expect(receive.mock.calls[0]?.[0].detail).toEqual({ botId: "specialist" });
  } finally {
    window.removeEventListener("doolittle:edit-bot", receive);
  }
});
it("requires an explicit archive confirmation and explains preserved history", async () => {
  act(() => root.render(<BotActions bot={bot} />));
  act(() => button("Archive…")?.click());
  expect(request).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Conversations and history are retained");
  await act(async () => button("Archive bot")?.click());
  expect(request).toHaveBeenCalledWith("/bots/specialist/archive", "POST");
});

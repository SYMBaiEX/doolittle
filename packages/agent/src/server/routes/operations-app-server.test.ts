import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleOperationsRoutes } from "./operations";

describe("managed app terminal discovery route", () => {
  it("exposes the existing managed session identity for desktop terminal stop controls", async () => {
    const sessions = [
      {
        id: "app-session",
        processId: 123,
        managed: true,
        command: "bun run dev",
        cwd: "/workspace/blog",
        state: "running",
      },
    ];
    const managedApplicationSessions = vi.fn(() => sessions);
    const context = {
      services: { terminal: { managedApplicationSessions } },
    } as unknown as AppContext;
    const url = new URL("http://localhost/terminal/sessions");
    const response = await handleOperationsRoutes(
      context,
      new Request(url),
      url,
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ sessions });
    expect(managedApplicationSessions).toHaveBeenCalledTimes(1);
  });
});

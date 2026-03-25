import { describe, expect, it } from "bun:test";

import {
  isRecoverablePgliteInitError,
  validateCriticalRuntimeServices,
} from "./bootstrap";

describe("bootstrap recovery", () => {
  it("treats rolodex startup failures with a database cause as recoverable", () => {
    const error = new Error("[FollowUpService] RolodexService is not available", {
      cause: new Error("Database adapter not initialized"),
    });

    expect(isRecoverablePgliteInitError(error)).toBe(true);
  });

  it("does not treat generic rolodex availability issues as pglite errors", () => {
    expect(
      isRecoverablePgliteInitError(
        new Error("[FollowUpService] RolodexService is not available"),
      ),
    ).toBe(false);
  });

  it("treats plugin-sql recovery failures as recoverable startup errors", () => {
    expect(
      isRecoverablePgliteInitError(
        new Error(
          "PGlite recovery failed for /tmp/pglite: lock file already exists",
        ),
      ),
    ).toBe(true);
  });

  it("loads rolodex before probing the world rooms", async () => {
    const calls: string[] = [];
    const runtime = {
      agentId: "agent-123",
      async getServiceLoadPromise(name: string) {
        calls.push(`service:${name}`);
        return { name };
      },
      async getRooms(_worldId: string) {
        calls.push("rooms");
        return [];
      },
    };

    await validateCriticalRuntimeServices(runtime as never);

    expect(calls).toEqual(["service:rolodex", "rooms"]);
  });
});

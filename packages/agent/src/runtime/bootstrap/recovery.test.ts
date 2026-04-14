import { describe, expect, it } from "bun:test";
import {
  createPgliteRecoveryMessage,
  createPgliteRetryFailureError,
} from "./recovery/messaging";
import { isRecoverablePgliteInitError } from "./recovery/recoverable";

describe("bootstrap recovery", () => {
  it("treats rolodex startup failures with a database cause as recoverable", () => {
    const error = new Error(
      "[FollowUpService] RolodexService is not available",
      {
        cause: new Error("Database adapter not initialized"),
      },
    );

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

  it("formats stale-lock recovery messaging without changing the wording", () => {
    expect(
      createPgliteRecoveryMessage(
        "retry-without-reset",
        "/tmp/pglite",
        new Error("lock file already exists"),
      ),
    ).toBe(
      "[doolittle] PGLite startup failed (lock file already exists). Cleared a stale lock in /tmp/pglite and retrying once.",
    );
  });

  it("keeps the retry failure guidance user-facing and actionable", () => {
    expect(
      createPgliteRetryFailureError(
        "/tmp/pglite",
        new Error("database disk image is malformed"),
      ).message,
    ).toBe(
      "PGLite startup failed after automatic recovery at /tmp/pglite: database disk image is malformed. Run `doolittle doctor` or remove the local DB directory if it is still corrupted.",
    );
  });
});

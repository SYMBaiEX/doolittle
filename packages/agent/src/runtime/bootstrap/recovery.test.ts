import { describe, expect, it } from "bun:test";

import { isRecoverablePgliteInitError } from "./recovery";

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
});

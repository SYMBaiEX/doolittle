import { describe, expect, it } from "vitest";
import type { RuntimeLike } from "../runtime";
import {
  NativeTrajectoryLoggerUnavailableError,
  requireNativeTrajectoryLogger,
} from "./index";

describe("native trajectory lifecycle", () => {
  it("returns the SDK-owned trajectory logger", () => {
    const logger = {
      isEnabled: () => true,
      listTrajectories: () => ({ trajectories: [], total: 0 }),
      exportTrajectories: async () => ({
        data: "",
        filename: "trajectories.jsonl",
        mimeType: "application/x-ndjson",
      }),
    };
    const runtime = {
      getService: (name: string) => (name === "trajectories" ? logger : null),
    } as unknown as RuntimeLike;

    expect(requireNativeTrajectoryLogger(runtime)).toBe(logger);
  });

  it("fails closed when the SDK-owned logger is unavailable", () => {
    const runtime = {
      getService: () => null,
    } as unknown as RuntimeLike;

    expect(() => requireNativeTrajectoryLogger(runtime)).toThrow(
      NativeTrajectoryLoggerUnavailableError,
    );
  });
});

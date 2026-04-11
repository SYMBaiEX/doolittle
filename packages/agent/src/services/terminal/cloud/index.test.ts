import { describe, expect, it } from "bun:test";
import * as cloud from "./index";

describe("terminal cloud namespace barrel", () => {
  it("re-exports the planning and backend helpers", () => {
    expect(typeof cloud.buildCloudProfile).toBe("function");
    expect(typeof cloud.buildRemoteSyncPlan).toBe("function");
    expect(typeof cloud.createCloudExecutionBackends).toBe("function");
    expect(typeof cloud.isValidEnvName).toBe("function");
  });
});

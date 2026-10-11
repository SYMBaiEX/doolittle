import { describe, expect, it } from "vitest";
import { DesktopExecutionAdmission } from "./execution-admission";
import { readExecutionCapacity } from "./execution-capacity";

describe("operator fleet capacity", () => {
  it("selects only named numeric limits and keeps safe defaults", () => {
    expect(readExecutionCapacity({})).toEqual({});
    const options = readExecutionCapacity({
      DOOLITTLE_ENGINE_MAX_EXECUTIONS: "8",
      DOOLITTLE_ENGINE_MAX_AUTOMATIC_ACP: "3",
      UNRELATED: "anything",
    });
    expect(
      new DesktopExecutionAdmission(options).snapshot().capacity,
    ).toMatchObject({ total: 8, automaticAcp: 3 });
  });
  it("rejects invalid or incompatible limits instead of ignoring the operator's policy", () => {
    expect(() =>
      readExecutionCapacity({ DOOLITTLE_ENGINE_MAX_EXECUTIONS: "0" }),
    ).toThrow(/Invalid fleet capacity/);
    expect(
      () =>
        new DesktopExecutionAdmission(
          readExecutionCapacity({
            DOOLITTLE_ENGINE_MAX_EXECUTIONS: "2",
            DOOLITTLE_ENGINE_MAX_AUTOMATIC_ACP: "3",
          }),
        ),
    ).toThrow(RangeError);
  });
});

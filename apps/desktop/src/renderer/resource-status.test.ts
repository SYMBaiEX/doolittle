import { describe, expect, it, vi } from "vitest";
import type { ApiResource } from "./lib";
import { summarizeResourceStatuses } from "./resource-status";

const resource = (
  fields: Partial<ApiResource<unknown>> = {},
): ApiResource<unknown> => ({
  data: null,
  error: "",
  loading: false,
  reload: vi.fn(),
  ...fields,
});

describe("summarizeResourceStatuses", () => {
  it.each([
    ["disabled", resource({ status: "disabled" })],
    ["loading", resource({ status: "loading", loading: true })],
    ["ready", resource({ status: "ready", data: { ok: true }, hasData: true })],
    [
      "refreshing",
      resource({
        status: "refreshing",
        data: { ok: true },
        isValidating: true,
        hasData: true,
      }),
    ],
    ["error", resource({ status: "error", error: "nope" })],
  ] as const)("preserves %s lifecycle", (status, item) => {
    expect(
      summarizeResourceStatuses([{ label: "x", resource: item }]).status,
    ).toBe(status);
  });

  it("keeps required and optional counts separate", () => {
    const summary = summarizeResourceStatuses([
      { label: "core", resource: resource({ status: "ready", data: 1 }) },
      {
        label: "loading extra",
        required: false,
        resource: resource({ status: "loading", loading: true }),
      },
      {
        label: "failed extra",
        required: false,
        resource: resource({ status: "error", error: "bad" }),
      },
    ]);
    expect(summary.required).toEqual({
      total: 1,
      ready: 1,
      pending: 0,
      errors: 0,
    });
    expect(summary.optional).toEqual({
      total: 2,
      ready: 0,
      pending: 1,
      errors: 1,
    });
    expect(summary.status).toBe("error");
  });

  it("recognizes a stale error that still has cached data", () => {
    const summary = summarizeResourceStatuses([
      {
        label: "cached",
        resource: resource({
          status: "error",
          error: "stale",
          data: { old: true },
          hasData: true,
        }),
      },
    ]);
    expect(summary.hasData).toBe(true);
    expect(summary.status).toBe("error");
  });
});

import { describe, expect, it } from "bun:test";
import { formatLoggerError, normalizeLogFields } from "./serialize";

describe("@doolittle/logger serialize", () => {
  it("formats non-error values without throwing", () => {
    const detail = formatLoggerError("boom");
    expect(detail).toBe("boom");
    expect(formatLoggerError(123 as unknown)).toContain("123");
    expect(formatLoggerError({ nested: true } as unknown)).toContain("nested");

    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    expect(formatLoggerError(circular)).toBe("[object Object]");
  });

  it("returns undefined for missing fields and redacts configured keys with default placeholder", () => {
    expect(normalizeLogFields(undefined)).toBeUndefined();

    const fields = normalizeLogFields(
      {
        token: "super-secret",
        nested: { password: "vault", safe: true },
        list: [{ credential: "x" }, { credential: "y" }, { credential: "z" }],
      },
      {
        redact: {
          keys: ["token"],
          pathFragments: ["nested.password", "credential"],
        },
      },
    );

    expect(fields).toEqual({
      token: "[REDACTED]",
      nested: {
        password: "[REDACTED]",
        safe: true,
      },
      list: [
        {
          credential: "[REDACTED]",
        },
        {
          credential: "[REDACTED]",
        },
        {
          credential: "[REDACTED]",
        },
      ],
    });
  });

  it("normalizes custom types and hard limits for objects, arrays, and depths", () => {
    const fields = normalizeLogFields(
      {
        callback: () => "ok",
        big: 10n,
        marker: Symbol("trace"),
        endpoint: new URL("https://example.com/api"),
        tags: new Set(["a", "b", "c"]),
        map: new Map<string, string | number>([
          ["feature", "enabled"],
          ["count", 2],
        ]),
        nested: {
          deep: {
            deeper: {
              tooDeep: "shouldTruncate",
            },
          },
        },
      },
      {
        serialization: {
          maxDepth: 2,
          maxArrayLength: 1,
          maxObjectEntries: 1,
        },
      },
    );

    expect(typeof fields?.callback).toBe("string");
    expect(fields?.callback).toContain("[Function ");
    expect(fields).not.toHaveProperty("big");
    expect(fields).not.toHaveProperty("marker");
    expect(fields).not.toHaveProperty("endpoint");
    expect(fields).not.toHaveProperty("tags");
    expect(fields).not.toHaveProperty("map");
    expect(fields).not.toHaveProperty("nested");
    expect(fields).toHaveProperty("_truncated", 6);
  });

  it("serializes error metadata including cause and errors arrays", () => {
    const fields = normalizeLogFields({
      err: Object.assign(new Error("outer"), {
        cause: Object.assign(new Error("cause"), {
          message: "cause",
          code: "CAUSE_CODE",
        }),
        errors: [new Error("one"), new Error("two")],
      }),
    });

    expect(fields?.err).toMatchObject({
      name: "Error",
      message: "outer",
      cause: {
        name: "Error",
        message: "cause",
        code: "CAUSE_CODE",
      },
    });
    expect(
      Array.isArray((fields?.err as Record<string, unknown>)?.errors),
    ).toBe(true);
    expect((fields?.err as { errors?: unknown[] }).errors?.length).toBe(2);
  });

  it("uses custom serializers for errors", () => {
    const fields = normalizeLogFields(
      { err: new Error("custom") },
      {
        serializers: {
          error: () => ({ handled: "serializer" }),
        },
      },
    );

    expect(fields).toEqual({ err: { handled: "serializer" } });
  });
});

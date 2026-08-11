import { describe, expect, test } from "vitest";
import { apiResourceCacheKey, errorMessage, formatDataPreview } from "./lib";

describe("apiResourceCacheKey", () => {
  test("shares endpoint data while isolating workspace-scoped dependencies", () => {
    expect(apiResourceCacheKey("/runtime/accounts", [true])).toBe(
      apiResourceCacheKey("/runtime/accounts", [true]),
    );
    expect(apiResourceCacheKey("/repo/status", [true, "/repo/a"])).not.toBe(
      apiResourceCacheKey("/repo/status", [true, "/repo/b"]),
    );
    expect(apiResourceCacheKey(null, [true])).toBeNull();
  });
});

describe("errorMessage", () => {
  test("removes Electron IPC request wrappers", () => {
    expect(
      errorMessage(
        "Error invoking remote method 'agent:request': Error: The local runtime is not ready.",
      ),
    ).toBe("The local runtime is not ready.");
  });

  test("preserves useful application errors", () => {
    expect(errorMessage(new Error("Provider authentication expired."))).toBe(
      "Provider authentication expired.",
    );
  });
});

describe("formatDataPreview", () => {
  test("formats structured data and bounds oversized output", () => {
    expect(formatDataPreview({ ready: true })).toContain('"ready": true');
    expect(formatDataPreview("x".repeat(40), 12)).toContain("more characters");
  });
});

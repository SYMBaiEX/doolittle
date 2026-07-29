import { describe, expect, test } from "vitest";
import { errorMessage, formatDataPreview } from "./lib";

describe("errorMessage", () => {
  test("removes Electron IPC request wrappers", () => {
    expect(
      errorMessage(
        "Error invoking remote method 'api:request': Error: The local runtime is not ready.",
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

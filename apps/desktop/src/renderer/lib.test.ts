import { describe, expect, test } from "vitest";
import { errorMessage } from "./lib";

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

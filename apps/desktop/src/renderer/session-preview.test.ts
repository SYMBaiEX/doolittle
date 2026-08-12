import { describe, expect, it } from "vitest";
import { compactSessionPreview } from "./session-preview";

describe("compactSessionPreview", () => {
  it("turns embedded resources into filename-only references", () => {
    expect(
      compactSessionPreview(
        "[Embedded resource: file:///Users/symbiex/dev/test/src/app/page.tsx]",
      ),
    ).toBe("Referenced page.tsx");
  });

  it("shortens raw local paths without changing ordinary prose", () => {
    expect(
      compactSessionPreview("Read: /Users/symbiex/dev/test/package.json"),
    ).toBe("Read: package.json");
    expect(compactSessionPreview("Review the workspace setup")).toBe(
      "Review the workspace setup",
    );
  });
});

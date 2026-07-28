import { describe, expect, it } from "vitest";
import { detectCodeLanguage } from "./code-language";

describe("detectCodeLanguage", () => {
  it("recognizes source files and React variants", () => {
    expect(detectCodeLanguage("src/App.tsx")).toEqual({
      id: "typescript",
      label: "TypeScript React",
    });
    expect(detectCodeLanguage("scripts/setup.py").id).toBe("python");
  });

  it("recognizes extensionless and configuration filenames", () => {
    expect(detectCodeLanguage("Dockerfile").id).toBe("dockerfile");
    expect(detectCodeLanguage(".env.example").id).toBe("ini");
    expect(detectCodeLanguage("src/types.d.ts").label).toBe(
      "TypeScript Declaration",
    );
  });

  it("falls back to plain text", () => {
    expect(detectCodeLanguage("LICENSE")).toEqual({
      id: "plaintext",
      label: "Plain Text",
    });
  });
});

import { describe, expect, it } from "bun:test";
import {
  CODEGEN_PRD_USAGE,
  CODEGEN_RESEARCH_USAGE,
  parseCodegenDescriptor,
} from "./parsers";

describe("codegen command parsers", () => {
  it("parses descriptor metadata with defaults", () => {
    expect(
      parseCodegenDescriptor(
        "demo | apis:github,slack | requirements:qa :: build an assistant",
      ),
    ).toEqual({
      projectName: "demo",
      targetType: "plugin",
      description: "build an assistant",
      apis: ["github", "slack"],
      requirements: ["qa"],
    });
  });

  it("returns null for malformed descriptors and keeps usage text stable", () => {
    expect(parseCodegenDescriptor("demo without separator")).toBeNull();
    expect(CODEGEN_RESEARCH_USAGE).toContain("/codegen research");
    expect(CODEGEN_PRD_USAGE).toContain("/codegen prd");
  });
});

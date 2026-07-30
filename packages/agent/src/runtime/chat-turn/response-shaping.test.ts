import { describe, expect, it } from "vitest";
import { buildSystemFactsContext } from "./response-shaping";

describe("chat turn response shaping", () => {
  it("builds system facts from runtime settings and workspace context", () => {
    const context: Parameters<typeof buildSystemFactsContext>[0] = {
      config: {
        workspaceDir: "/tmp/doolittle-workspace",
      } as never,
      runtime: {} as never,
      services: {
        settings: {
          get: () => ({
            execution: { backend: "docker" },
            model: { provider: "openai" },
          }),
        },
      } as never,
    };

    const message = buildSystemFactsContext(context);

    expect(message).toContain("Live machine facts:");
    expect(message).toContain("- workspace=/tmp/doolittle-workspace");
    expect(message).toContain("- shell access=yes via terminal service");
    expect(message).toContain("- execution backend=docker");
    expect(message).toContain("- provider=openai");
  });
});

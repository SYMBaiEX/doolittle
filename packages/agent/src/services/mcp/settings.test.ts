import { describe, expect, it } from "vitest";
import { createElizaMcpSettingsFromCommand } from "./settings";

describe("createElizaMcpSettingsFromCommand", () => {
  it("preserves quoted stdio arguments in official Eliza settings", () => {
    expect(
      createElizaMcpSettingsFromCommand(
        'npx -y server-filesystem "./Project Files"',
        15_000,
      ),
    ).toEqual({
      servers: {
        doolittle: {
          type: "stdio",
          command: "npx",
          args: ["-y", "server-filesystem", "./Project Files"],
          timeoutInMillis: 15_000,
        },
      },
      maxRetries: 2,
    });
  });

  it("rejects shell operators instead of passing them to an MCP transport", () => {
    expect(() =>
      createElizaMcpSettingsFromCommand("trusted-server && unsafe", 10_000),
    ).toThrow("shell operators are not supported");
  });
});

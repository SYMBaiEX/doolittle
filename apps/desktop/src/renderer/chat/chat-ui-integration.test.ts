import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rendererRoot = new URL("../", import.meta.url);

function readRendererFile(name: string): string {
  return readFileSync(new URL(name, rendererRoot), "utf8");
}

describe("Eliza UI chat integration", () => {
  it("keeps the official primitives in the final renderer style order", () => {
    const main = readRendererFile("main.tsx");
    expect(main.indexOf("./app-polish.css")).toBeGreaterThan(-1);
    expect(main.indexOf("./chat-ui.css")).toBeGreaterThan(
      main.indexOf("./app-polish.css"),
    );
  });

  it("uses the UI package for composer, status, and message actions", () => {
    const composer = readRendererFile("chat/ChatComposer.tsx");
    const actions = readRendererFile("chat/MessageActions.tsx");
    expect(composer).toContain("@elizaos/ui/components/ui/button");
    expect(composer).toContain("@elizaos/ui/components/ui/textarea");
    expect(composer).toContain("@elizaos/ui/components/ui/status-badge");
    expect(actions).toContain("@elizaos/ui/components/ui/button");
  });
});

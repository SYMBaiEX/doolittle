import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rendererRoot = new URL("../", import.meta.url);

function readRendererFile(name: string): string {
  return readFileSync(new URL(name, rendererRoot), "utf8");
}

describe("Eliza UI chat integration", () => {
  it("does not add a handwritten integration stylesheet after Tailwind", () => {
    const main = readRendererFile("main.tsx");
    expect(main).not.toContain("./chat-ui.css");
  });

  it("uses the UI package for composer, status, and message actions", () => {
    const composer = readRendererFile("chat/ChatComposer.tsx");
    const actions = readRendererFile("chat/MessageActions.tsx");
    expect(composer).toContain("@elizaos/ui/components/ui/button");
    expect(composer).toContain("@elizaos/ui/components/ui/textarea");
    expect(composer).toContain("@elizaos/ui/components/ui/status-badge");
    expect(actions).toContain("@elizaos/ui/components/ui/button");
  });

  it("keeps the textarea borderless while the rounded composer owns focus", () => {
    const composer = readRendererFile("chat/ChatComposer.tsx");
    expect(composer).toContain("!border-0");
    expect(composer).toContain("focus-visible:!outline-none");
    expect(composer).toContain("[box-shadow:none]!");
    expect(composer).not.toContain("focus-visible:!ring-0");
  });
});

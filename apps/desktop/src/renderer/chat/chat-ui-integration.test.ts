import { readFileSync } from "node:fs";
import { compile } from "tailwindcss";
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
    expect(composer).toContain("@doolittle/ui");
    expect(composer).toContain("ComposerFrame");
    expect(composer).toContain("@elizaos/ui/components/ui/textarea");
    expect(composer).toContain("@elizaos/ui/components/ui/status-badge");
    expect(actions).toContain("@doolittle/ui");
    const controls = readFileSync(
      new URL("../../../../../packages/ui/src/controls.tsx", import.meta.url),
      "utf8",
    );
    expect(controls).toContain("@elizaos/ui/button");
  });

  it("keeps a neutral focus indicator on the textarea, not the whole form", () => {
    const composer = readRendererFile("chat/ChatComposer.tsx");
    expect(composer).toContain("!border-0");
    expect(composer).toContain("focus-visible:!outline-2");
    expect(composer).toContain("focus-visible:!outline-solid");
    expect(composer).toContain("focus-visible:!outline-[var(--text-soft)]");
    expect(composer).not.toContain("focus-visible:!outline-none");
    expect(composer).toContain("[box-shadow:none]!");
    expect(composer).not.toContain("focus-visible:!ring-0");
    const styles = readFileSync(
      new URL("../../../../../packages/ui/src/styles.css", import.meta.url),
      "utf8",
    );
    expect(styles).toContain(".dl-composer textarea:focus-visible");
    expect(styles).not.toContain(".dl-composer:has(textarea:focus-visible)");
  });

  it("explicitly compiles a painted solid textarea outline, not just its width", async () => {
    const composer = readRendererFile("chat/ChatComposer.tsx");
    const compiler = await compile("@tailwind utilities;");
    const focusUtilities = composer.match(/focus-visible:![^\s"]+/gu) ?? [];
    const css = compiler.build(focusUtilities);
    expect(css).toContain("outline-style: solid !important");
    expect(css).toContain("--tw-outline-style: solid !important");
    expect(css).toContain("outline-width: 2px !important");
    expect(css).toContain("outline-color: var(--text-soft) !important");
    expect(css).not.toContain("outline-color: var(--focus-ring)");
    expect(css).not.toContain(".chat-composer:focus");
  });

  it("keeps recovery and announcements out of composer grid placement", () => {
    const page = readRendererFile("ChatPage.tsx");
    expect(page).toContain('className="chat-transcript-region"');
    expect(page).toContain('className="chat-composer-dock"');
    expect(page).toContain(
      'data-layout={isEmptyConversation ? "empty" : "active"}',
    );
    expect(page).toContain(
      "isNewConversation && loadingHistory !== selectedId && !historyError",
    );
    const composerDock = page.indexOf('className="chat-composer-dock"');
    expect(page.indexOf("{storageWarning ? (")).toBeLessThan(composerDock);
    expect(page.indexOf("{runHydrationWarnings.length > 0 ? (")).toBeLessThan(
      composerDock,
    );
    expect(page.indexOf("{accessibilityStatus}")).toBeLessThan(composerDock);
    expect(page.match(/<ChatComposer\s/gu)).toHaveLength(1);
  });

  it("lets extra composer tools flow inside the short-pane scrollport", () => {
    const composer = readRendererFile("chat/ChatComposer.tsx");
    expect(composer).toContain("chat-composer-tool-menu");
    expect(composer).toContain("[@media(max-height:640px)]:static");
    expect(composer).toContain("[@media(max-height:640px)]:flex-wrap");
    expect(
      composer.match(/\[@media\(max-height:640px\)\]:max-h-28/gu),
    ).toHaveLength(2);
    expect(composer).toContain(
      "list.scrollTop += selected.bottom - bounds.bottom",
    );
    expect(composer).not.toContain("option.scrollIntoView");
  });
});

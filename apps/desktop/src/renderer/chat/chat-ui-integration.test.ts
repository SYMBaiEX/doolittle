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

  it("keeps a small focus marker without a rectangular textarea outline", () => {
    const composer = readRendererFile("chat/ChatComposer.tsx");
    expect(composer).toContain("!border-0");
    expect(composer).toContain("focus-visible:!outline-none");
    expect(composer).not.toContain("focus-visible:!outline-2");
    expect(composer).not.toContain("focus-visible:!outline-[var(--text-soft)]");
    expect(composer).not.toContain("[box-shadow:none]!");
    expect(composer).not.toContain("focus-visible:!ring-0");
    const styles = readFileSync(
      new URL("../../../../../packages/ui/src/styles.css", import.meta.url),
      "utf8",
    );
    expect(styles).toContain(".dl-composer textarea:focus-visible");
    expect(styles).toContain("box-shadow: inset 2px 0 0 var(--text-soft)");
    expect(styles).toContain("@media (forced-colors: active)");
    expect(styles).toContain("outline: 1px solid Highlight");
    expect(styles).not.toContain("outline: 2px solid var(--text-soft)");
    expect(styles).not.toContain(".dl-composer:has(textarea:focus-visible)");
  });

  it("suppresses ordinary outlines with an OS high-contrast-only fallback", async () => {
    const composer = readRendererFile("chat/ChatComposer.tsx");
    const compiler = await compile("@tailwind utilities;");
    const focusUtilities =
      composer.match(/(?:forced-colors:)?focus-visible:![^\s"]+/gu) ?? [];
    const css = compiler.build(focusUtilities);
    expect(css).toContain("outline-style: solid !important");
    expect(css).toContain("--tw-outline-style: solid !important");
    expect(css).toContain("outline-style: none !important");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("outline-width: 1px !important");
    expect(css).toContain("outline-color: Highlight !important");
    expect(css).not.toContain("outline-width: 2px !important");
    expect(css).not.toContain("outline-color: var(--text-soft) !important");
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
    expect(composer).toContain(
      "[@container_session_(max-height:640px)]:static",
    );
    expect(composer).toContain(
      "[@container_session_(max-height:640px)]:flex-wrap",
    );
    expect(
      composer.match(/\[@container_session_\(max-height:640px\)\]:max-h-28/gu),
    ).toHaveLength(2);
    expect(composer).toContain(
      "list.scrollTop += selected.bottom - bounds.bottom",
    );
    expect(composer).not.toContain("option.scrollIntoView");
    expect(composer).not.toContain("[@media(max-height:640px)]");
  });
});

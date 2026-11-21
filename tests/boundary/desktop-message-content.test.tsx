// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageContent } from "../../apps/desktop/src/renderer/components/MessageContent";
import { highlightMessageCode } from "../../apps/desktop/src/renderer/components/message-code-highlight";

describe("desktop source in chat", () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
  let host: HTMLDivElement;
  let root: Root;
  const writeText = vi.fn(async (_text: string) => undefined);
  const previousClipboard = Object.getOwnPropertyDescriptor(
    navigator,
    "clipboard",
  );

  beforeEach(() => {
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    if (previousClipboard)
      Object.defineProperty(navigator, "clipboard", previousClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
    environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });

  function button(name: string) {
    const element = Array.from(host.querySelectorAll("button")).find(
      (node) => node.getAttribute("aria-label") === name,
    );
    if (!element) throw new Error(`Expected ${name} control.`);
    return element;
  }

  it("names fenced files and keeps original whitespace through wrapping, expanding, and copying", async () => {
    const original = [
      "  <not-an-element value='literal'>  ",
      ...Array<string>(21).fill("  sample	"),
      "",
    ].join("\n");
    const markdown = [
      "See the `example` below.",
      "",
      '```text filename="src/long example.txt"',
      original,
      "```",
    ].join("\n");
    act(() => root.render(<MessageContent content={markdown} />));

    const figure = host.querySelector(
      'figure[aria-label="src/long example.txt"]',
    );
    expect(figure?.querySelector("code")?.textContent).toBe(original);
    expect(figure?.querySelector("not-an-element")).toBeNull();
    expect(
      host.querySelector('[data-streamdown="inline-code"]')?.textContent,
    ).toBe("example");
    const scroll = host.querySelector(
      'section[aria-label="src/long example.txt code"]',
    );
    expect(scroll?.getAttribute("tabindex")).toBe("0");
    expect(button("Wrap lines").getAttribute("aria-pressed")).toBe("false");

    act(() => button("Wrap lines").click());
    act(() => button("Expand code").click());
    expect(button("Wrap lines").getAttribute("aria-pressed")).toBe("true");
    expect(scroll?.hasAttribute("data-wrapped")).toBe(true);
    expect(scroll?.hasAttribute("data-expanded")).toBe(true);
    await act(async () => button("Copy code").click());
    expect(writeText).toHaveBeenCalledWith(original);
  });

  it("keeps streamed patch signs and source intact while distinguishing change and metadata lines", async () => {
    const patch =
      "--- a/main.ts\n+++ b/main.ts\n@@ -1 +1 @@\n-const previous = 1;\n+const updated = 2;";
    act(() =>
      root.render(
        <MessageContent content={["```diff", patch].join("\n")} pending />,
      ),
    );
    expect(host.querySelector('[data-code-change="header"]')?.textContent).toBe(
      "--- a/main.ts",
    );
    expect(
      host.querySelector('[data-code-change="removed"]')?.textContent,
    ).toBe("-const previous = 1;");
    expect(host.querySelector('[data-code-change="added"]')?.textContent).toBe(
      "+const updated = 2;",
    );
    expect(host.querySelector("figure")?.textContent).toContain("Streaming");
    await act(async () => button("Copy code").click());
    expect(writeText).toHaveBeenCalledWith(patch);
  });

  it("colors known syntax without altering or injecting source text", async () => {
    const source = 'const label = "<script>literal</script>";\n// Keep this';
    const lines = await highlightMessageCode(source, "typescript");
    expect(
      lines?.map((line) => line.map(({ text }) => text).join("")).join("\n"),
    ).toBe(source);
    expect(lines?.flat()).toEqual(
      expect.arrayContaining([
        { text: "const", role: "keyword" },
        { text: "// Keep this", role: "comment" },
      ]),
    );
    expect(
      await highlightMessageCode(source, "unknown-language"),
    ).toBeUndefined();
  });
});

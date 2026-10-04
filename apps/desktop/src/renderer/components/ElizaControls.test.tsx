import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Button,
  ELIZA_SELECT_TEXT_CLASS,
  Input,
  Textarea,
} from "./ElizaControls";

describe("Doolittle Eliza control density adapter", () => {
  it("uses the shared density token for ordinary controls", () => {
    const markup = renderToStaticMarkup(
      <>
        <Button>Save</Button>
        <Input aria-label="Name" />
        <Textarea aria-label="Notes" />
      </>,
    );

    expect(markup).toContain("!h-[var(--control-height)]");
    expect(markup).toContain("max-[760px]:!h-11");
    expect(markup).toContain("!min-h-[var(--control-height)]");
    expect(markup).toContain("!text-[length:var(--text-control)]");
  });

  it("gives textareas their own multi-line minimum height", () => {
    const markup = renderToStaticMarkup(<Textarea aria-label="Notes" />);

    expect(markup).toContain(
      "--doolittle-textarea-min-height:calc(var(--control-height)*2)",
    );
    expect(markup).toContain("!min-h-[var(--doolittle-textarea-min-height)]");
    expect(markup).toContain("!text-[length:var(--text-body)]");
    expect(markup).toContain(
      "max-[760px]:[--doolittle-textarea-min-height:72px]",
    );
  });

  it("uses one visible keyboard focus ring for standalone SDK controls", () => {
    const markup = renderToStaticMarkup(
      <>
        <Button>Save</Button>
        <Input aria-label="Name" />
        <Textarea aria-label="Notes" />
      </>,
    );
    expect(
      markup.match(/focus-visible:outline-\[var\(--focus-ring\)\]/gu),
    ).toHaveLength(3);
    expect(markup).toContain("motion-reduce:transition-none");
    expect(markup).toContain("active:shadow-none");
    expect(markup).toContain("text-[var(--accent-ink)]");
  });

  it("keeps select menus on the compact control scale", () => {
    expect(ELIZA_SELECT_TEXT_CLASS).toBe("!text-[length:var(--text-control)]");
  });

  it("preserves SDK error styling and exposes invalid fields semantically", () => {
    const markup = renderToStaticMarkup(
      <>
        <Input aria-label="Name" hasError />
        <Textarea aria-label="Notes" hasError />
      </>,
    );
    expect(markup.match(/aria-invalid="true"/gu)).toHaveLength(2);
    expect(markup.match(/ border-\[var\(--bad\)\]/gu)).toHaveLength(2);
    expect(markup.match(/bg-\[var\(--bad-soft\)\]/gu)).toHaveLength(2);
  });

  it("does not override explicit icon or large button sizes", () => {
    const markup = renderToStaticMarkup(
      <>
        <Button size="icon-sm">+</Button>
        <Button size="lg">Launch</Button>
      </>,
    );

    expect(markup).not.toContain("!h-[var(--control-height)]");
    expect(markup).toContain("h-8 w-8");
    expect(markup).toContain("h-11");
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  Input,
  NativeSelect,
  Select,
  SelectTrigger,
  Textarea,
} from "./controls";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("shared SDK control bridge", () => {
  it("keeps quiet buttons form-safe with a named visible focus contract", () => {
    const markup = renderToStaticMarkup(
      <Button aria-label="Conversation options" variant="ghost">
        More
      </Button>,
    );
    expect(markup).toContain('type="button"');
    expect(markup).toContain("dl-control");
    expect(markup).toContain("focus-visible:outline");
    expect(markup).not.toContain("shadow-[var(--control-contact)]");
  });

  it("preserves caller validation semantics and explicit submit intent", () => {
    const invalid = renderToStaticMarkup(<Input hasError aria-label="Name" />);
    expect(invalid).toContain('aria-invalid="true"');
    expect(invalid).toContain("dl-field");
    const overridden = renderToStaticMarkup(
      <Input hasError aria-invalid={false} aria-label="Name" />,
    );
    expect(overridden).toContain('aria-invalid="false"');
    expect(renderToStaticMarkup(<Button type="submit">Save</Button>)).toContain(
      'type="submit"',
    );
  });

  it("retains multiline input space instead of applying a one-line height", () => {
    const markup = renderToStaticMarkup(<Textarea aria-label="Instructions" />);
    expect(markup).toContain("doolittle-textarea-min-height");
    expect(markup).not.toContain("!h-[var(--control-height)]");
    expect(markup).toContain("dl-control");
  });

  it("keeps shared text fields and dropdown triggers free of focus-ring utilities", () => {
    const markup = renderToStaticMarkup(
      <>
        <Input aria-label="Name" />
        <Textarea aria-label="Message" />
        <NativeSelect aria-label="View">
          <option>Details</option>
        </NativeSelect>
        <Select>
          <SelectTrigger aria-label="Model">Choose model</SelectTrigger>
        </Select>
      </>,
    );
    const container = document.createElement("div");
    container.innerHTML = markup;
    expect(
      container.querySelectorAll(
        "input.dl-field, textarea.dl-field, select.dl-field, button.dl-field",
      ),
    ).toHaveLength(4);
    expect(markup).not.toContain("focus-visible:outline-2");
    expect(markup).not.toContain("focus-visible:outline-offset-2");
    expect(markup).not.toContain("focus-visible:border-[var(--focus-ring)]");
  });

  it("keeps native selection controlled across external route updates", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    const render = (value: string) =>
      act(() =>
        root.render(
          <NativeSelect aria-label="Section" value={value} onChange={onChange}>
            <option value="general">General</option>
            <option value="system">System</option>
          </NativeSelect>,
        ),
      );
    try {
      render("general");
      const select = container.querySelector("select");
      expect(select?.value).toBe("general");
      select?.focus();
      render("system");
      expect(container.querySelector("select")).toBe(select);
      expect(select?.value).toBe("system");
      expect(document.activeElement).toBe(select);
      expect(onChange).not.toHaveBeenCalled();
      act(() => {
        if (!select) throw new Error("Missing native select");
        select.value = "general";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(onChange).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});

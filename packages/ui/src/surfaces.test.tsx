import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ContactRow,
  ConversationFrame,
  RunState,
  StateSurface,
  WorkspaceShell,
} from "./surfaces";

describe("controlled browser-only compositions", () => {
  it("renders navigation, content and optional inspector without a desktop bridge", () => {
    const markup = renderToStaticMarkup(
      createElement(
        WorkspaceShell,
        {
          navigation: "Contacts",
          header: "Doolittle",
          inspector: "Details",
        },
        "Conversation",
      ),
    );
    expect(markup).toContain("dl-navigation");
    expect(markup).toContain("dl-inspector");
    expect(markup).toContain('data-layout="companion"');
    expect(markup).not.toContain("window.doolittle");
  });

  it("marks the active contact and retains a textual state label", () => {
    const markup = renderToStaticMarkup(
      createElement(ContactRow, {
        name: "Research",
        avatar: "R",
        selected: true,
        state: "attention",
        onSelect: () => {},
      }),
    );
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="Needs attention"');
    expect(markup).toContain('type="button"');
  });

  it.each([
    "running",
    "waiting",
    "attention",
    "complete",
    "stopped",
    "error",
    "offline",
  ] as const)("labels canonical %s state", (state) => {
    const markup = renderToStaticMarkup(createElement(RunState, { state }));
    expect(markup).toContain(`data-state="${state}"`);
    expect(markup).toContain("aria-label=");
  });

  it("does not mount a missing composer or inspector", () => {
    const markup = renderToStaticMarkup(
      createElement(ConversationFrame, null, "History"),
    );
    expect(markup).toContain("History");
    expect(markup).not.toContain("dl-composer-slot");
  });

  it("distinguishes loading and actionable errors", () => {
    const loading = renderToStaticMarkup(
      createElement(StateSurface, {
        kind: "loading",
        title: "Opening conversation",
      }),
    );
    expect(loading).toContain('aria-busy="true"');
    const error = renderToStaticMarkup(
      createElement(StateSurface, {
        kind: "error",
        title: "Cannot connect",
        action: "Retry",
      }),
    );
    expect(error).toContain('role="alert"');
    expect(error).toContain("Retry");
  });
});

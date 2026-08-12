// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderConnectionRow } from "./ProviderConnectionRow";

describe("ProviderConnectionRow interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps routing primary and exposes secondary actions through the native menu", () => {
    const onSetDefault = vi.fn();
    const onSignIn = vi.fn();

    act(() =>
      root.render(
        <ProviderConnectionRow
          busy={false}
          descriptor={{
            accountSignIn: true,
            key: "claude-code",
            label: "Claude Code",
            shortLabel: "CC",
          }}
          isDefault={false}
          onCancelSignIn={vi.fn()}
          onConnect={vi.fn()}
          onSetDefault={onSetDefault}
          onSignIn={onSignIn}
          onSubmitCode={vi.fn()}
          ready
          status={{ fallbackReady: true }}
        />,
      ),
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    const primary = buttons.find(
      (button) => button.textContent === "Use CLI fallback",
    );
    const more = container.querySelector<HTMLButtonElement>(
      '[aria-label="More actions for Claude Code"]',
    );
    expect(more).not.toBeNull();
    act(() => primary?.click());
    expect(onSetDefault).toHaveBeenCalledTimes(1);

    act(() =>
      more?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      ),
    );
    const repair = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((item) => item.textContent === "Repair sign-in");
    expect(repair).toBeDefined();
    act(() => repair?.click());
    expect(onSignIn).toHaveBeenCalledWith("claude-code");
  });

  it("submits a copied auth code and keeps cancellation available in the menu", () => {
    const onCancelSignIn = vi.fn();
    const onSubmitCode = vi.fn();

    act(() =>
      root.render(
        <ProviderConnectionRow
          authState={{
            browserOpened: true,
            codeSubmitted: false,
            message: "Paste the copied authorization code.",
            needsCodeSubmission: true,
            phase: "waiting",
            provider: "codex",
            updatedAt: "2026-08-12T00:00:00.000Z",
          }}
          busy={false}
          descriptor={{
            accountSignIn: true,
            key: "codex",
            label: "Codex",
            shortLabel: "CX",
          }}
          isDefault={false}
          onCancelSignIn={onCancelSignIn}
          onConnect={vi.fn()}
          onSetDefault={vi.fn()}
          onSignIn={vi.fn()}
          onSubmitCode={onSubmitCode}
          ready={false}
          status={{}}
        />,
      ),
    );

    const submit = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Use copied code",
    );
    const more = container.querySelector<HTMLButtonElement>(
      '[aria-label="More actions for Codex"]',
    );
    act(() => submit?.click());
    expect(onSubmitCode).toHaveBeenCalledWith("codex");

    act(() =>
      more?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      ),
    );
    const cancel = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((item) => item.textContent === "Cancel sign-in");
    act(() => cancel?.click());
    expect(onCancelSignIn).toHaveBeenCalledWith("codex");
  });

  it("disables both action surfaces while a provider mutation is busy", () => {
    act(() =>
      root.render(
        <ProviderConnectionRow
          busy
          descriptor={{
            accountSignIn: true,
            key: "claude-code",
            label: "Claude Code",
            shortLabel: "CC",
          }}
          isDefault={false}
          onCancelSignIn={vi.fn()}
          onConnect={vi.fn()}
          onSetDefault={vi.fn()}
          onSignIn={vi.fn()}
          onSubmitCode={vi.fn()}
          ready
          status={{ fallbackReady: true }}
        />,
      ),
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(
      buttons.find((button) => button.textContent === "Use CLI fallback")
        ?.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="More actions for Claude Code"]',
      )?.disabled,
    ).toBe(true);
  });
});

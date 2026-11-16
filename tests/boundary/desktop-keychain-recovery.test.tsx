import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DesktopRuntimeNotices } from "../../apps/desktop/src/renderer/app-shell/DesktopRuntimeNotices";

it("explains locked credentials before generic timeout advice and keeps recovery available", () => {
  const markup = renderToStaticMarkup(
    createElement(DesktopRuntimeNotices, {
      backend: {
        phase: "degraded",
        message: "Runtime stopped",
        detail: "vault master key unavailable: OS Keychain timed out",
      },
      globalError: "",
      onRestart: () => {},
      onRefresh: () => {},
    }),
  );
  expect(markup).toContain("Your saved accounts are locked");
  expect(markup).toContain("Mac login password, not your Apple ID password");
  expect(markup).toContain("Restart runtime");
  expect(markup).not.toContain("The runtime did not become ready in time");
});

it("announces startup without asking the user to restart a healthy launch", () => {
  const markup = renderToStaticMarkup(
    createElement(DesktopRuntimeNotices, {
      backend: { phase: "booting", message: "Starting private runtime" },
      globalError: "",
      onRestart: () => {},
      onRefresh: () => {},
    }),
  );
  expect(markup).toContain("Starting Doolittle");
  expect(markup).not.toContain("Restart runtime");
});

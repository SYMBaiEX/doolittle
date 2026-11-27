// @vitest-environment jsdom
import { expect, it } from "vitest";
import { applyDesktopFoundationTokens } from "../../apps/desktop/src/renderer/desktop-theme";
import {
  COMPANION_THEME,
  themeCssVariables,
} from "../../packages/ui/src/themes";

it("uses semantic component spacing tokens instead of a dead numbered scale", () => {
  applyDesktopFoundationTokens();
  const style = document.documentElement.style;
  expect(style.getPropertyValue("--page-gap")).toBe("12px");
  expect(style.getPropertyValue("--card-pad")).toBe("12px");
  expect(style.getPropertyValue("--row-pad")).toBe("8px");
  expect(style.getPropertyValue("--control-height")).toBe("40px");
  expect(style.getPropertyValue("--space-1")).toBe("");
  expect(style.getPropertyValue("--space-hairline")).toBe("");

  const generated = themeCssVariables(COMPANION_THEME, "dark", "comfortable");
  expect(generated["--page-gap"]).toBeTruthy();
  expect(generated["--card-pad"]).toBeTruthy();
  expect(generated["--row-pad"]).toBeTruthy();
  expect(generated["--control-height"]).toBeTruthy();
  expect(
    Object.keys(generated).filter((key) => key.startsWith("--space-")),
  ).toEqual([]);
});

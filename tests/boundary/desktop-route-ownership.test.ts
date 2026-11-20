import { describe, expect, it } from "vitest";
import {
  createDesktopNavigationHistory,
  desktopNavigationTarget,
  pushDesktopNavigationHistory,
  replaceDesktopNavigationEntry,
} from "../../apps/desktop/src/renderer/app-shell/desktop-navigation-history";
import { sameComputerOrigin } from "../../apps/desktop/src/renderer/computer-origin";
import {
  desktopHashForView,
  renderedViewForView,
  resolveDesktopHash,
} from "../../apps/desktop/src/renderer/desktop-navigation";
import {
  SETTINGS_SHELL_SECTIONS,
  settingsSectionForView,
  settingsViewForSection,
} from "../../apps/desktop/src/renderer/settings/settings-sections";

describe("desktop route ownership", () => {
  it("retains an editor only for the same bot, conversation, and workspace", () => {
    const origin = {
      botId: "lead",
      originConversationId: "active-chat",
      workspacePath: "/projects/first",
    };
    expect(sameComputerOrigin(origin, { ...origin })).toBe(true);
    expect(
      sameComputerOrigin(origin, { ...origin, botId: "another-bot" }),
    ).toBe(false);
    expect(
      sameComputerOrigin(origin, {
        ...origin,
        originConversationId: "another-chat",
      }),
    ).toBe(false);
    expect(
      sameComputerOrigin(origin, {
        ...origin,
        workspacePath: "/projects/other",
      }),
    ).toBe(false);
  });
  it("keeps aliases in the same mounted workspace", () => {
    expect(resolveDesktopHash("#browser")).toMatchObject({
      view: "browser",
      canonicalHash: "#/code/preview",
      legacy: true,
    });
    expect(renderedViewForView("browser")).toBe("code");
    expect(renderedViewForView("agents")).toBe("orchestration");
    expect(renderedViewForView("media")).toBe("chat");
  });

  it("round-trips every settings section through its canonical route", () => {
    for (const section of SETTINGS_SHELL_SECTIONS) {
      const view = settingsViewForSection(section.id);
      expect(resolveDesktopHash(desktopHashForView(view)).view).toBe(view);
      expect(settingsSectionForView(view)).toBe(section.id);
      expect(renderedViewForView(view)).toBe("settings");
    }
  });

  it("replaces a restored editor origin in place and keeps it on back navigation", () => {
    const origin = {
      botId: "first-bot",
      originConversationId: "first-chat",
      workspacePath: "/projects/first",
    };
    const initial = createDesktopNavigationHistory({ view: "code" });
    const restored = replaceDesktopNavigationEntry(initial, {
      view: "code",
      computerOrigin: origin,
    });
    expect(desktopNavigationTarget(restored, -1)).toBeNull();
    const preview = pushDesktopNavigationHistory(restored, {
      view: "browser",
      computerOrigin: origin,
    });
    const deduplicated = pushDesktopNavigationHistory(preview, {
      view: "browser",
      computerOrigin: { ...origin },
    });
    expect(deduplicated).toBe(preview);
    expect(desktopNavigationTarget(preview, -1)).toMatchObject({
      view: "code",
      computerOrigin: origin,
    });
  });
});

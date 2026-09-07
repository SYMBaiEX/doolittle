import { describe, expect, it } from "vitest";
import {
  createDesktopNavigationHistory,
  desktopNavigationTarget,
  pushDesktopNavigationHistory,
} from "./desktop-navigation-history";

describe("desktop navigation history", () => {
  it("keeps actual visit order and ignores duplicate route updates", () => {
    const initial = createDesktopNavigationHistory("chat");
    const code = pushDesktopNavigationHistory(initial, "code");

    expect(pushDesktopNavigationHistory(code, "code")).toBe(code);
    expect(code).toEqual({ entries: ["chat", "code"], index: 1 });
  });

  it("moves backward and forward without changing the visit trail", () => {
    const history = pushDesktopNavigationHistory(
      pushDesktopNavigationHistory(
        createDesktopNavigationHistory("chat"),
        "code",
      ),
      "settings",
    );
    const back = desktopNavigationTarget(history, -1);
    const origin = back && desktopNavigationTarget(back.history, -1);
    const forward = origin && desktopNavigationTarget(origin.history, 1);

    expect(back?.view).toBe("code");
    expect(origin?.view).toBe("chat");
    expect(forward?.view).toBe("code");
    expect(forward?.history.entries).toEqual(["chat", "code", "settings"]);
  });

  it("replaces the forward trail after navigating from an older entry", () => {
    const settings = pushDesktopNavigationHistory(
      pushDesktopNavigationHistory(
        createDesktopNavigationHistory("chat"),
        "code",
      ),
      "settings",
    );
    const back = desktopNavigationTarget(settings, -1);
    const history = pushDesktopNavigationHistory(
      back?.history ?? settings,
      "browser",
    );

    expect(history).toEqual({
      entries: ["chat", "code", "browser"],
      index: 2,
    });
    expect(desktopNavigationTarget(history, 1)).toBeNull();
  });
});

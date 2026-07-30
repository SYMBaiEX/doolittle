import { describe, expect, it } from "vitest";
import {
  acknowledgeNavigationIntent,
  type DesktopNavigationIntent,
} from "./desktop-navigation-intent";

const intent: DesktopNavigationIntent = {
  id: "intent-1",
  kind: "workspace-file",
  target: { path: "/work/alpha/file.ts" },
};

describe("desktop navigation intents", () => {
  it("only consumes the exact parent-owned intent", () => {
    expect(acknowledgeNavigationIntent(intent, "different")).toBe(intent);
    expect(acknowledgeNavigationIntent(intent, intent.id)).toBeNull();
  });
});

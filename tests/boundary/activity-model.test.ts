import { expect, it } from "vitest";
import { activityTargetIsDistinct } from "../../apps/desktop/src/renderer/activity/activity-model";

it("hides targets that only restate the source badge", () => {
  expect(activityTargetIsDistinct("terminal", "terminal")).toBe(false);
  expect(activityTargetIsDistinct("chat-run", "chat")).toBe(false);
  expect(activityTargetIsDistinct("automation", "automations")).toBe(false);
});

it("keeps targets that add operational context", () => {
  expect(activityTargetIsDistinct("delegation", "orchestration")).toBe(true);
  expect(activityTargetIsDistinct("approval", "review")).toBe(true);
  expect(activityTargetIsDistinct("log", "operations")).toBe(true);
});

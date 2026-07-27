import { describe, expect, it } from "bun:test";
import {
  type AutomationDraft,
  buildAutomationRequest,
  summarizeAutomation,
} from "./automation-model";

const baseDraft: AutomationDraft = {
  name: "Release watcher",
  triggerType: "schedule",
  schedule: "0 9 * * 1-5",
  conditionType: "always",
  conditionPath: "",
  conditionValue: "",
  actionType: "run-agent",
  prompt: "Review the release.",
  webhookUrl: "",
};

describe("automation model", () => {
  it("builds an explicit trigger-condition-action payload", () => {
    expect(buildAutomationRequest(baseDraft)).toEqual({
      ok: true,
      payload: {
        name: "Release watcher",
        schedule: "0 9 * * 1-5",
        prompt: "Review the release.",
        delivery: "local",
        trigger: { type: "schedule", schedule: "0 9 * * 1-5" },
        condition: { type: "always" },
        action: { type: "run-agent", prompt: "Review the release." },
      },
    });
  });

  it("validates conditional and webhook definitions before submission", () => {
    expect(
      buildAutomationRequest({
        ...baseDraft,
        conditionType: "equals",
        conditionPath: "not valid",
      }),
    ).toEqual({
      ok: false,
      error: "Condition fields use dot notation, such as event.status.",
    });
    expect(
      buildAutomationRequest({
        ...baseDraft,
        actionType: "webhook",
        webhookUrl: "https://user:secret@example.com/hook",
      }),
    ).toMatchObject({ ok: false });
  });

  it("summarizes enhanced and legacy cron records", () => {
    expect(
      summarizeAutomation({
        schedule: "every 2h",
        prompt: "Legacy prompt",
      }),
    ).toMatchObject({
      triggerType: "schedule",
      triggerLabel: "every 2h",
      conditionLabel: "Always",
      actionType: "prompt",
    });
    expect(
      summarizeAutomation({
        trigger: { type: "webhook", token: "hook-token" },
        condition: {
          type: "payload",
          path: "event.status",
          operator: "equals",
        },
        action: { type: "webhook", url: "https://example.com/receive" },
      }),
    ).toMatchObject({
      triggerType: "webhook",
      webhookPath: "/cron/webhooks/hook-token",
      conditionLabel: "event.status equals",
      actionType: "webhook",
    });
  });
});

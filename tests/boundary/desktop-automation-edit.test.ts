import { expect, it } from "vitest";
import {
  buildAutomationEditRequest,
  editAutomationDraft,
} from "../../apps/desktop/src/renderer/automation-model";

it("keeps a legacy schedule and only patches changed definition fields", () => {
  const initial = editAutomationDraft({
    name: "Legacy report",
    schedule: "every 2h",
    prompt: "Summarize open work.",
    delivery: "origin",
    runtime: { maxTokens: 2_000 },
  });
  expect(initial).toMatchObject({
    triggerType: "schedule",
    schedule: "every 2h",
    actionType: "prompt",
    prompt: "Summarize open work.",
  });
  expect(buildAutomationEditRequest(initial, initial)).toEqual({
    ok: true,
    payload: {},
  });
  expect(
    buildAutomationEditRequest({ ...initial, name: "New name" }, initial),
  ).toEqual({ ok: true, payload: { name: "New name" } });
  expect(
    buildAutomationEditRequest({ ...initial, schedule: "every 3h" }, initial),
  ).toEqual({
    ok: true,
    payload: { trigger: { type: "schedule", schedule: "every 3h" } },
  });
});

it("edits webhook conditions without resending tokens or unrelated job metadata", () => {
  const initial = editAutomationDraft({
    name: "Incoming report",
    trigger: { type: "webhook", token: "test-token" },
    condition: {
      type: "payload",
      operator: "equals",
      path: "state",
      value: "ready",
    },
    action: {
      type: "webhook",
      method: "POST",
      url: "http://127.0.0.1:4000/sink",
    },
    delivery: "home",
    status: "paused",
  });
  expect(
    buildAutomationEditRequest(
      { ...initial, conditionValue: "complete" },
      initial,
    ),
  ).toEqual({
    ok: true,
    payload: {
      condition: {
        type: "payload",
        operator: "equals",
        path: "state",
        value: "complete",
      },
    },
  });
});

it("validates changed actions against the original named bot target", () => {
  const initial = editAutomationDraft({
    name: "Named report",
    targetBotId: "742c6f4e-2c29-4fb9-9154-3443a7ab3e4c",
    schedule: "manual",
    prompt: "Summarize open work.",
  });
  expect(
    buildAutomationEditRequest(
      { ...initial, targetBotId: "default", triggerType: "webhook" },
      initial,
    ),
  ).toMatchObject({ ok: false });
  expect(
    buildAutomationEditRequest(
      { ...initial, targetBotId: "default", prompt: "Summarize new work." },
      initial,
    ),
  ).toEqual({
    ok: true,
    payload: { action: { type: "prompt", prompt: "Summarize new work." } },
  });
});

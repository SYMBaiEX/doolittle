// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationDraft } from "./automation-model";
import { AutomationBuilder } from "./automations/AutomationBuilder";

const { useApiResourceMock } = vi.hoisted(() => ({
  useApiResourceMock: vi.fn(),
}));

vi.mock("./lib", async () => {
  const actual = await vi.importActual<typeof import("./lib")>("./lib");
  return {
    ...actual,
    useApiResource: useApiResourceMock,
  };
});

import {
  AutomationDeleteConfirmation,
  AutomationsPage,
} from "./AutomationsPage";

const baseDraft: AutomationDraft = {
  name: "Morning brief",
  triggerType: "schedule",
  schedule: "0 9 * * 1-5",
  conditionType: "always",
  conditionPath: "",
  conditionValue: "",
  actionType: "run-agent",
  prompt: "Review the latest work.",
  webhookUrl: "",
};

function buildResource<T>(data: T | null) {
  return {
    data,
    error: "",
    loading: false,
    reload: vi.fn(),
  };
}

describe("AutomationDeleteConfirmation", () => {
  it("makes the safe choice the default and explains the consequence", () => {
    const markup = renderToStaticMarkup(
      <AutomationDeleteConfirmation
        automationName="Morning brief"
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(markup).toContain("<fieldset");
    expect(markup).toContain("Delete Morning brief?");
    expect(markup).toContain("stops future triggers");
    expect(markup).toContain("Confirm delete");
    expect(markup).toContain("Cancel");
  });

  it("locks both choices while deletion is running", () => {
    const markup = renderToStaticMarkup(
      <AutomationDeleteConfirmation
        automationName="Morning brief"
        busy
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(markup).toContain("Deleting…");
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/disabled=""/gu)).toHaveLength(2);
  });
});

describe("AutomationBuilder", () => {
  it("keeps schedule fields compact while still exposing inline guidance", () => {
    const markup = renderToStaticMarkup(
      <AutomationBuilder
        busy={false}
        draft={baseDraft}
        onSubmit={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(markup).toContain("<fieldset");
    expect(markup).toContain("Automation definition");
    expect(markup).toContain("0 9 * * 1-5 or every 2h");
    expect(markup).toContain(
      "Runs on a 5-field cron or interval such as every 30m.",
    );
    expect(markup).not.toContain("Workflow details");
  });

  it("shows trigger, condition, and webhook-specific fields for non-default variants", () => {
    const markup = renderToStaticMarkup(
      <AutomationBuilder
        busy={false}
        draft={{
          ...baseDraft,
          triggerType: "webhook",
          conditionType: "equals",
          conditionPath: "event.status",
          conditionValue: "ready",
          actionType: "webhook",
          webhookUrl: "https://example.com/hooks/doolittle",
        }}
        onSubmit={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(markup).toContain(
      "A private local webhook path is generated after save.",
    );
    expect(markup).toContain("Payload field");
    expect(markup).toContain("Value");
    expect(markup).toContain("Destination URL");
    expect(markup).toContain(
      "Sends a JSON POST without stored authorization headers.",
    );
  });
});

describe("AutomationsPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    useApiResourceMock.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("replaces zero-value chrome with one focused first-workflow action", () => {
    useApiResourceMock.mockImplementation((path: string | null) => {
      if (path === "/cron/jobs") return buildResource({ jobs: [] });
      return buildResource(null);
    });

    act(() => root.render(<AutomationsPage active />));

    expect(
      container.querySelector('[aria-label="Automation summary"]'),
    ).toBeNull();
    expect(container.querySelector(".automation-empty-panel")).not.toBeNull();
    expect(container.textContent).toContain("Build your first workflow");
    expect(container.textContent).not.toContain("Webhook inputs");
    expect(container.textContent).toContain("Weekday brief");
    expect(container.textContent).toContain("Webhook triage");
    expect(container.textContent).toContain("View past runs");

    const useStarter = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Weekday brief"),
    );
    expect(useStarter).toBeDefined();

    act(() => useStarter?.click());

    expect(container.textContent).toContain("Automation definition");
    expect(container.textContent).toContain("Close builder");
    expect(container.querySelector(".automation-empty-panel")).toBeNull();
    expect(container.textContent).toContain("Run history");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[placeholder="Release readiness"]',
      )?.value,
    ).toBe("Weekday brief");
    expect(
      container.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder^="Review the latest work"]',
      )?.value,
    ).toContain("current workspace");
  });

  it("loads trace receipts only after the operator opens the drawer", () => {
    const requestedPaths: Array<string | null> = [];
    useApiResourceMock.mockImplementation((path: string | null) => {
      requestedPaths.push(path);
      if (path === "/cron/jobs") {
        return buildResource({
          jobs: [
            {
              id: "job-1",
              name: "Morning brief",
              status: "active",
              nextRunAt: "2026-08-12T14:00:00Z",
              trigger: { type: "schedule", schedule: "0 9 * * 1-5" },
              condition: { type: "always" },
              action: { type: "run-agent", prompt: "Review the latest work." },
              prompt: "Review the latest work.",
            },
          ],
        });
      }
      if (path === "/cron/runs") {
        return buildResource({
          runs: [
            {
              id: "run-1",
              jobName: "Morning brief",
              status: "completed",
              triggerType: "schedule",
              completedAt: "2026-08-12T14:05:00Z",
              trace: [
                {
                  id: "step-1",
                  phase: "trigger",
                  status: "completed",
                  message: "Accepted for delivery.",
                },
              ],
            },
          ],
        });
      }
      return buildResource(null);
    });

    act(() => root.render(<AutomationsPage active />));

    expect(requestedPaths).toContain("/cron/jobs");
    expect(requestedPaths).not.toContain("/cron/runs");
    expect(container.textContent).toContain("Open to load");

    const traces = container.querySelector<HTMLDetailsElement>(
      ".automation-runs-panel",
    );
    expect(traces).not.toBeNull();

    act(() => {
      if (!traces) return;
      traces.open = true;
      traces.dispatchEvent(new Event("toggle", { bubbles: false }));
    });

    expect(requestedPaths).toContain("/cron/runs");
    expect(container.textContent).toContain("Morning brief");
    expect(container.textContent).toContain("Accepted for delivery.");
  });
});

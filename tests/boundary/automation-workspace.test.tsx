// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { AutomationWorkspace } from "../../apps/desktop/src/renderer/automations/AutomationWorkspace";

const noop = () => {};
const noopAsync = async () => true;

it("keeps automation timing in the row time slot with all detail actions", () => {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    const nextRunAt = new Date(Date.now() + 192 * 60_000).toISOString();
    act(() =>
      root.render(
        <AutomationWorkspace
          builderOpen={false}
          busy=""
          jobs={[
            {
              id: "job",
              name: "Morning brief",
              status: "active",
              schedule: "0 9 * * 1-5",
              nextRunAt,
            },
          ]}
          jobsError={null}
          jobsLoading={false}
          onAction={noopAsync}
          onCreate={noop}
          onEdit={noop}
          onFeedback={noop}
          onReloadJobs={noop}
          onReloadRuns={noop}
          onRunsOpenChange={noop}
          onSelectRun={noop}
          onToggleBuilder={noop}
          runs={[]}
          runsError={null}
          runsLoading={false}
          runsOpen={false}
        />,
      ),
    );
    expect(host.querySelector(".ws-rail .ws-row__time")?.textContent).toBe(
      "Next in 3h 12m",
    );
    const actionBar = host.querySelector(
      ".automation-detail-column .ws-actions",
    );
    expect(
      [...(actionBar?.querySelectorAll("button") ?? [])].map((entry) => [
        entry.textContent,
        entry.className,
      ]),
    ).toEqual([
      ["Run now", "primary-button"],
      ["Edit", "secondary-button"],
      ["Pause", "secondary-button"],
      ["Delete", "danger-button"],
    ]);
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});

function workspaceProps() {
  return {
    builderOpen: false,
    busy: "",
    jobs: [
      {
        id: "job-a",
        name: "Morning brief",
        status: "active",
        schedule: "0 9 * * 1-5",
      },
      {
        id: "job-b",
        name: "Webhook triage",
        status: "active",
        schedule: "webhook",
      },
    ],
    jobsError: null,
    jobsLoading: false,
    onAction: noopAsync,
    onCreate: noop,
    onEdit: noop,
    onFeedback: noop,
    onReloadJobs: noop,
    onReloadRuns: noop,
    onRunsOpenChange: noop,
    onSelectRun: noop,
    onToggleBuilder: noop,
    runs: [],
    runsError: null,
    runsLoading: false,
    runsOpen: false,
  };
}

function renderWorkspace(
  host: HTMLDivElement,
  props: ReturnType<typeof workspaceProps> = workspaceProps(),
) {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(host);
  act(() => root.render(<AutomationWorkspace {...props} />));
  return {
    root,
    restore() {
      reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
    },
  };
}

function mockContainerWidth(width: number) {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  return () => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
    }
  };
}

it("uses distinct row status tiers for active and paused automations", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const props = workspaceProps();
  props.jobs[1] = { ...props.jobs[1], status: "paused" };
  const { root, restore } = renderWorkspace(host, props);
  try {
    const rows = [...host.querySelectorAll(".ws-rail .ws-row")];
    expect(
      rows[0]?.querySelector(".ws-row__mark")?.getAttribute("data-tier"),
    ).toBe("active");
    expect(
      rows[1]?.querySelector(".ws-row__mark")?.getAttribute("data-tier"),
    ).toBe("muted");
    expect(
      rows[1]?.querySelector(".ws-row__status")?.getAttribute("data-tier"),
    ).toBe("muted");
  } finally {
    act(() => root.unmount());
    host.remove();
    restore();
  }
});

it("keeps both panes mounted at wide container widths", () => {
  const restoreWidth = mockContainerWidth(1024);
  const host = document.createElement("div");
  document.body.append(host);
  const { root, restore } = renderWorkspace(host);
  try {
    expect(host.querySelector(".ws-split.automation-split--single")).toBeNull();
    expect(host.querySelector(".ws-rail")).not.toBeNull();
    expect(host.querySelector(".automation-detail-column")).not.toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    restore();
    restoreWidth();
  }
});

it("trades list and detail as one pane at narrow container widths", () => {
  const restoreWidth = mockContainerWidth(360);
  const host = document.createElement("div");
  document.body.append(host);
  const { root, restore } = renderWorkspace(host);
  try {
    // The list fills the surface first; no detail pane competes for height.
    expect(
      host.querySelector(".ws-split.automation-split--single"),
    ).not.toBeNull();
    expect(host.querySelectorAll(".ws-rail .ws-row").length).toBe(2);
    expect(host.querySelector(".automation-detail-column")).toBeNull();

    // Selecting a row navigates to its detail with a way back.
    const row = host.querySelector<HTMLButtonElement>(".ws-rail .ws-row");
    act(() => row?.click());
    expect(host.querySelector(".ws-rail")).toBeNull();
    expect(host.querySelector(".automation-detail-column")).not.toBeNull();
    expect(
      host.querySelector(".automation-detail-column .ws-detail__title")
        ?.textContent,
    ).toBe("Morning brief");

    const back = host.querySelector<HTMLButtonElement>(
      ".automation-detail-back button",
    );
    expect(back?.textContent).toContain("Automations");
    // Focus travels with the navigation instead of dropping to the body.
    expect(document.activeElement).toBe(back);
    act(() => back?.click());
    expect(host.querySelectorAll(".ws-rail .ws-row").length).toBe(2);
    expect(host.querySelector(".automation-detail-column")).toBeNull();
    expect(document.activeElement).toBe(
      host.querySelector('.ws-row[aria-current="true"]'),
    );
  } finally {
    act(() => root.unmount());
    host.remove();
    restore();
    restoreWidth();
  }
});

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
      [...(actionBar?.querySelectorAll("button") ?? [])].map(
        (entry) => entry.textContent,
      ),
    ).toEqual(["Run now", "Edit", "Pause", "Delete"]);
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});

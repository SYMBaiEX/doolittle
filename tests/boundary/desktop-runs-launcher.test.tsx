// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  OrchestrationRunsPanel,
  type OrchestrationRunsPanelProps,
} from "../../apps/desktop/src/renderer/orchestration/OrchestrationRunsPanel";
import { CODEGEN_MODES } from "../../apps/desktop/src/renderer/orchestration/orchestration-runs-model";

const noop = () => {};
const resource = { data: {}, error: "", loading: false, reload: noop };
const defaults: OrchestrationRunsPanelProps = {
  active: true,
  codegenRuntimeResource: resource,
  codegenWorkflowsResource: resource,
  workflowDetailResource: resource,
  runDetailResource: resource,
  codegenExecution: {},
  codegenAvailable: true,
  codegenReady: true,
  workflowSummary: {},
  codegenMode: "generate",
  codegenProjectName: "example",
  codegenPrompt: "Keep this draft",
  codegenProjectPath: "/workspace/example",
  codegenTargetType: "plugin",
  busyKeys: {},
  workflows: [],
  visibleRuns: [],
  bundleWorkflowId: "",
  bundleResult: null,
  bundleError: "",
  bundleLoading: false,
  onCodegenModeChange: noop,
  onCodegenProjectNameChange: noop,
  onCodegenPromptChange: noop,
  onCodegenProjectPathChange: noop,
  onCodegenTargetTypeChange: noop,
  onSubmitCodegen: noop,
  onSelectWorkflow: noop,
  onSelectRun: noop,
  onRequestRunCancellation: noop,
  onDismissRunCancellation: noop,
  confirmedRunCancellation: "",
  onLoadBundle: noop,
  onCancelRun: noop,
};

let host: HTMLDivElement;
let root: Root;
const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousAct: boolean | undefined;

beforeEach(() => {
  previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
});

function render(overrides: Partial<OrchestrationRunsPanelProps> = {}) {
  act(() =>
    root.render(<OrchestrationRunsPanel {...defaults} {...overrides} />),
  );
}

it("gives confirmed empty history to the launcher without remounting its draft", () => {
  render();
  const draft = host.querySelector("textarea");
  expect(
    host.querySelector(".orchestration-run-browser")?.hasAttribute("hidden"),
  ).toBe(true);
  expect(
    host.querySelector(".orchestration-run-detail")?.hasAttribute("hidden"),
  ).toBe(true);

  render({ workflows: [{ id: "workflow", title: "Existing workflow" }] });
  expect(
    host.querySelector(".orchestration-run-browser")?.hasAttribute("hidden"),
  ).toBe(false);
  expect(host.textContent).toContain("Existing workflow");
  expect(host.querySelector("textarea")).toBe(draft);
  expect(draft?.value).toBe("Keep this draft");
});

it("does not disguise loading or failed history as an empty collection", () => {
  render({ codegenWorkflowsResource: { ...resource, loading: true } });
  expect(
    host.querySelector(".orchestration-run-browser")?.hasAttribute("hidden"),
  ).toBe(false);
  render({
    codegenWorkflowsResource: { ...resource, error: "History unavailable" },
  });
  expect(
    host.querySelector(".orchestration-run-browser")?.hasAttribute("hidden"),
  ).toBe(false);
  expect(host.textContent).toContain("History unavailable");
});

it("marks the selected workflow mode with a visible neutral indicator", () => {
  render({ codegenMode: "research" });
  const choices = [
    ...host.querySelectorAll<HTMLButtonElement>(
      ".orchestration-mode-grid button",
    ),
  ];
  const selected = choices.find(
    (choice) => choice.getAttribute("aria-current") === "true",
  );
  expect(selected?.textContent).toContain("Research");
  expect(selected?.className).toContain("selected");
  expect(
    selected?.querySelector(".orchestration-mode-grid__check"),
  ).not.toBeNull();
  for (const choice of choices.filter((entry) => entry !== selected)) {
    expect(choice.querySelector(".orchestration-mode-grid__check")).toBeNull();
  }
});

it.each(CODEGEN_MODES)(
  "keeps $label fields, submission and execution gates",
  (mode) => {
    const submit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render({ codegenMode: mode.id, onSubmitCodegen: submit });
    const run = host.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(run?.textContent).toBe(`Run ${mode.label}`);
    expect(run?.disabled).toBe(false);
    expect(host.querySelector("textarea") !== null).toBe(mode.id !== "qa");
    expect(
      [...host.querySelectorAll("label")].some(
        (label) => label.textContent === "Target",
      ),
    ).toBe(mode.id === "research" || mode.id === "prd");
    act(() => run?.click());
    expect(submit).toHaveBeenCalledOnce();

    for (const gate of [
      { active: false },
      { codegenReady: false },
      { busyKeys: { [`codegen:${mode.id}`]: true } },
    ]) {
      render({ codegenMode: mode.id, onSubmitCodegen: submit, ...gate });
      expect(run?.disabled).toBe(true);
      act(() => run?.click());
      expect(submit).toHaveBeenCalledOnce();
    }
  },
);

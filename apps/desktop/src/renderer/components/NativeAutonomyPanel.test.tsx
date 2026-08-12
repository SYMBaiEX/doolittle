import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  NativeAutonomyPanel,
  type NativeAutonomyResponse,
} from "./NativeAutonomyPanel";

function render(data: NativeAutonomyResponse) {
  return renderToStaticMarkup(
    <NativeAutonomyPanel
      autonomy={{
        data,
        error: "",
        loading: false,
        reload: vi.fn(),
      }}
    />,
  );
}

describe("NativeAutonomyPanel", () => {
  it("shows native autonomy disabled until the operator enables it", () => {
    const markup = render({
      success: true,
      data: {
        enabled: false,
        running: false,
        interval: 30_000,
        characterName: "Doolittle",
      },
    });

    expect(markup).toContain("Autonomy loop");
    expect(markup).toContain("runtime-autonomy-panel");
    expect(markup).toContain("runtime-autonomy-controls");
    expect(markup).toContain("Off");
    expect(markup).toContain("Enable native autonomy");
    expect(markup).toContain("30 seconds");
  });

  it("reports the official running state and cadence", () => {
    const markup = render({
      success: true,
      data: {
        enabled: true,
        running: true,
        interval: 60_000,
        characterName: "Operator",
      },
    });

    expect(markup).toContain("Running");
    expect(markup).toContain("Operator autonomous reasoning");
    expect(markup).toContain("Disable native autonomy");
    expect(markup).toContain("1 minute");
  });
});

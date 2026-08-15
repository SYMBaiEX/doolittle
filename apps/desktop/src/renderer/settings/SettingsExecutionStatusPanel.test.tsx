import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsExecutionStatusPanel } from "./SettingsExecutionStatusPanel";

describe("SettingsExecutionStatusPanel", () => {
  it("packs backend health into a compact readiness grid", () => {
    const markup = renderToStaticMarkup(
      <SettingsExecutionStatusPanel
        data={{
          backends: [
            { backend: "local", detail: "Native shell", ready: true },
            { backend: "remote", detail: "Not configured", ready: false },
          ],
        }}
        error=""
        loading={false}
        onReload={vi.fn()}
      />,
    );

    expect(markup).toContain("1/2 ready");
    expect(markup).toContain('data-settings-execution-backends="true"');
    expect(markup).toContain("Native shell");
    expect(markup).toContain("Unavailable");
    expect(markup).toContain(">Recheck</button>");
  });

  it("renders an explicit empty state instead of a blank list", () => {
    const markup = renderToStaticMarkup(
      <SettingsExecutionStatusPanel
        data={{ backends: [] }}
        error=""
        loading={false}
        onReload={vi.fn()}
      />,
    );

    expect(markup).toContain("0/0 ready");
    expect(markup).toContain("No execution backends were reported");
    expect(markup).not.toContain('class="stack-list"');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsExecutionStatusPanel } from "./SettingsExecutionStatusPanel";

describe("SettingsExecutionStatusPanel", () => {
  it("presents backend health as readable status rows", () => {
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
    expect(markup).toContain("text-sm font-semibold");
    expect(markup).not.toContain("text-[10px]");
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

  it("disables recheck during loading and uses the error retry as the sole action", () => {
    const loading = renderToStaticMarkup(
      <SettingsExecutionStatusPanel
        data={null}
        error=""
        loading
        onReload={vi.fn()}
      />,
    );
    expect(loading).toContain("Checking execution backends");
    expect(loading).toContain('disabled=""');

    const error = renderToStaticMarkup(
      <SettingsExecutionStatusPanel
        data={null}
        error="Backend check failed"
        loading={false}
        onReload={vi.fn()}
      />,
    );
    expect(error).toContain("Try again");
    expect(error).not.toContain(">Recheck</button>");
  });

  it("wraps long backend paths instead of widening the Settings content", () => {
    const markup = renderToStaticMarkup(
      <SettingsExecutionStatusPanel
        data={{
          backends: [
            {
              backend: "docker",
              detail:
                "failed to connect to the docker API at unix:///Users/example/.docker/run/docker.sock",
              ready: false,
            },
          ],
        }}
        error=""
        loading={false}
        onReload={vi.fn()}
      />,
    );

    expect(markup).toContain("unix:///Users/example/.docker/run/docker.sock");
    expect(markup).toContain("[overflow-wrap:anywhere]");
    expect(markup).not.toContain("whitespace-nowrap");
  });
});

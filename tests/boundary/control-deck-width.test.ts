import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderEcosystemContent } from "../../apps/cli/src/cli/control-deck/ecosystem";
import { renderGatewayOpsContent } from "../../apps/cli/src/cli/control-deck/gateway";
import { renderJobsContent } from "../../apps/cli/src/cli/control-deck/jobs";
import { renderResponsesContent } from "../../apps/cli/src/cli/control-deck/responses";
import { renderSuggestionsContent } from "../../apps/cli/src/cli/control-deck/suggestions";
import { resolveControlDeckContentWidth } from "../../apps/cli/src/cli/control-deck/width";
import { createCliJob } from "../../apps/cli/src/cli/jobs/store";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import type { TuiThemeProfile } from "../../packages/agent/src/runtime/theme-catalog";

vi.mock("@doolittle/agent/runtime/native/service-bridge/ownership", () => ({
  getNativeEcosystemSnapshot: vi.fn(async () => ({
    packageAudit: {
      packages: [
        {
          packageName: "@elizaos/very-long-package-name-for-a-rail",
          compatibility: "lagging-latest",
          currentTag: "workspace-preview-with-extra-detail",
        },
      ],
    },
    ownership: {
      controlPlane: {
        serviceResolution: [{ source: "native" }, { source: "bridge" }],
      },
    },
    workspace: { summary: { optionalSkillPacks: 3 } },
    runtime: { latest: "1.2.3", beta: "1.3.0-beta.1" },
  })),
}));

function stripBlessedTags(value: string): string {
  return value.replace(/\\[{}]/gu, "").replace(/\{[^}]+\}/gu, "");
}

function visibleLines(content: string): string[] {
  return content.split("\n").map(stripBlessedTags);
}

function expectLinesWithin(content: string, width: number): void {
  for (const line of visibleLines(content)) {
    expect(line.length).toBeLessThanOrEqual(width);
  }
}

const theme = { sigil: ":::" } as TuiThemeProfile;
const temporaryDirs: string[] = [];

afterEach(() => {
  while (temporaryDirs.length) {
    rmSync(temporaryDirs.pop() ?? "", { recursive: true, force: true });
  }
});

describe("control deck width-aware density", () => {
  it("derives content width from the rendered control-deck widget", () => {
    expect(resolveControlDeckContentWidth(23, 160)).toBe(19);
    expect(resolveControlDeckContentWidth("100%-2", 80)).toBe(74);
  });

  it("keeps command suggestions inside a narrow rail and restores detail in a wide rail", () => {
    const narrow = renderSuggestionsContent(
      process.cwd(),
      "/status",
      theme,
      19,
    );
    const wide = renderSuggestionsContent(process.cwd(), "/status", theme, 72);

    expectLinesWithin(narrow, 19);
    expect(stripBlessedTags(narrow)).not.toContain(
      "Show the top-level agent runtime status summary.",
    );
    expect(stripBlessedTags(wide)).toContain(
      "Show the top-level agent runtime status summary.",
    );
  });

  it("clips job prompts and metadata to the available rail width", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-control-deck-"));
    temporaryDirs.push(dataDir);
    createCliJob(
      dataDir,
      "inspect the repository with a deliberately long background prompt that must not wrap through the rail",
    );
    const context = {
      config: { dataDir },
    } as AppContext;

    const content = renderJobsContent(context, 19);

    expectLinesWithin(content, 19);
    const promptLine = visibleLines(content).find((line) =>
      line.startsWith("  prompt="),
    );
    expect(promptLine).toBeDefined();
    expect(promptLine).toMatch(/…$/u);
  });

  it("clips gateway supervision and replay rows to the available rail width", async () => {
    const context = {
      gateway: {
        history: async () => ({
          traces: [],
          deliveries: [],
          attachments: [],
          inbox: [
            {
              recordId: "inbox-record-with-a-very-long-identifier",
              platform: "telegram",
              textPreview:
                "a long preview that should be clipped instead of wrapping",
            },
          ],
        }),
        supervision: () => [
          {
            at: "2026-01-02T12:34:56.000Z",
            detail:
              "gateway supervisor detail with enough length to fragment a narrow rail",
          },
        ],
        runtimeStatus: () => ({
          daemon: {
            watchdog: { running: true },
            state: {
              restartRuns: 2,
              restartRecoveries: 1,
              restartBackoffs: 0,
              lastWatchdogAt: "2026-01-02T12:34:56.000Z",
            },
            restartQueue: [],
          },
        }),
      },
    } as unknown as AppContext;

    const content = await renderGatewayOpsContent(context, 19);

    expectLinesWithin(content, 19);
    expect(content).toContain("Supervision");
  });

  it("clips response identifiers and room metadata to the available rail width", () => {
    const context = {
      services: {
        apiTransport: {
          list: () => [
            {
              id: "response-with-a-very-long-identifier",
              roomId: "room-with-a-very-long-identifier",
              previousResponseId: "previous-response-with-a-long-identifier",
            },
          ],
        },
      },
    } as unknown as AppContext;

    const content = renderResponsesContent(context, 19);

    expectLinesWithin(content, 19);
    expect(content).toContain("room=");
  });

  it("clips ecosystem package rows to the available rail width", async () => {
    const content = await renderEcosystemContent(
      {
        runtime: undefined,
        services: { gatewayConfig: undefined },
        config: undefined,
      } as unknown as AppContext,
      19,
    );

    expectLinesWithin(content, 19);
    expect(stripBlessedTags(content)).toContain("Priority Packages");
  });
});

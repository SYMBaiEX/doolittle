// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./components/CodeEditor", () => ({
  CodeEditor: () => null,
}));

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  },
});
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => null,
});

import { CodingWorkspacePage } from "./CodingWorkspacePage";
import { ConnectionsPage } from "./ConnectionsPage";
import { MemoryPage } from "./MemoryPage";
import { ModelsPage } from "./ModelsPage";
import { ReviewPage } from "./ReviewPage";
import {
  SettingsPage,
  settingsCategoryOffline,
  settingsResourcePolicy,
} from "./SettingsPage";
import { SkillsPage } from "./SkillsPage";
import { ToolsPage } from "./ToolsPage";

const pickWorkspace = async () => ({
  canceled: true,
  state: { currentPath: "", recentPaths: [] },
});

describe("configuration routes when the local runtime is inactive", () => {
  it.each([
    ["connections", renderToStaticMarkup(<ConnectionsPage active={false} />)],
    [
      "models",
      renderToStaticMarkup(
        <ModelsPage
          active={false}
          refreshRuntime={() => undefined}
          runtime={null}
        />,
      ),
    ],
    ["tools", renderToStaticMarkup(<ToolsPage active={false} />)],
    ["skills", renderToStaticMarkup(<SkillsPage active={false} />)],
    ["memory", renderToStaticMarkup(<MemoryPage active={false} />)],
    [
      "code",
      renderToStaticMarkup(
        <CodingWorkspacePage
          active={false}
          navigationIntent={null}
          onAcknowledgeNavigationIntent={() => undefined}
          onChooseWorkspace={pickWorkspace}
          onOpenWorkspacePath={pickWorkspace}
          onSendToChat={() => undefined}
          projectScope="all"
          workspacePath=""
        />,
      ),
    ],
    [
      "review",
      renderToStaticMarkup(
        <ReviewPage
          active={false}
          onSendToChat={() => undefined}
          projectScope="all"
          workspacePath=""
        />,
      ),
    ],
  ] as const)("renders %s as a compact offline state", (_name, markup) => {
    expect(markup).toContain("Local runtime is offline");
    expect(markup).toContain("until the local runtime is ready");
    expect(markup).not.toContain("No tools match");
    expect(markup).not.toContain("No skills match");
    expect(markup).not.toContain("Working tree clean");
    expect(markup).not.toContain("No review items yet");
  });

  it("keeps only local appearance and desktop controls visible offline", () => {
    expect(settingsCategoryOffline("providers", false)).toBe(true);
    expect(settingsCategoryOffline("model", false)).toBe(true);
    expect(settingsCategoryOffline("execution", false)).toBe(true);
    expect(settingsCategoryOffline("advanced", false)).toBe(true);
    expect(settingsCategoryOffline("appearance", false)).toBe(false);
    expect(settingsCategoryOffline("desktop", false)).toBe(false);
    expect(settingsCategoryOffline("appearance", true)).toBe(false);

    expect(settingsResourcePolicy("appearance", false)).toEqual({
      settings: false,
      themes: false,
      desktop: false,
      execution: false,
      runtime: false,
    });
    expect(settingsResourcePolicy("desktop", false)).toEqual({
      settings: false,
      themes: false,
      desktop: true,
      execution: false,
      runtime: false,
    });

    const markup = renderToStaticMarkup(<SettingsPage active={false} />);
    expect(markup).toContain(
      "Provider connections and account pools are unavailable",
    );
    expect(markup).toContain('aria-label="Settings categories"');
    expect(markup).toContain("Appearance");
    expect(markup).toContain("Desktop");
    expect(markup).not.toContain("Light, dark &amp; system");
  });
});

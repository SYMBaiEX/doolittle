import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeModelProvider } from "../../shared/contracts";
import {
  ComposerProjectSelector,
  filteredProviders,
} from "./ComposerSelectors";

const providers: RuntimeModelProvider[] = [
  {
    id: "ollama",
    label: "Ollama",
    mode: "local",
    ready: true,
    discovery: "live",
    detail: "Local models",
    models: [
      {
        id: "granite4.1:3b",
        label: "Granite 4.1",
        source: "discovered",
      },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    mode: "cloud",
    ready: true,
    discovery: "configured",
    detail: "Configured models",
    models: [
      {
        id: "claude-sonnet-4.6",
        label: "Claude Sonnet 4.6",
        source: "configured",
      },
    ],
  },
];

describe("composer selectors", () => {
  it("renders the active project as a tabbed composer control", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerProjectSelector, {
        activeProjectId: "project-1",
        onChooseRepository: vi.fn(),
        onManageProjects: vi.fn(),
        onSelectProject: vi.fn(),
        projects: [
          {
            id: "project-1",
            name: "Doolittle",
            color: "#ff6a00",
            primaryPath: "/workspace/doolittle",
          },
        ],
      }),
    );

    expect(markup).toContain("composer-project-trigger");
    expect(markup).toContain("Doolittle");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Conversation project");
  });

  it("keeps the general/no-repository state accessible", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerProjectSelector, {
        onChooseRepository: vi.fn(),
        onManageProjects: vi.fn(),
        onSelectProject: vi.fn(),
        projects: [],
      }),
    );
    expect(markup).toContain("General");
    expect(markup).toContain("General conversation without project context");
    expect(markup).toContain("Choose project. Current project General.");
    expect(markup).toContain('aria-expanded="false"');
  });

  it("preserves project trigger keyboard/dialog affordances", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerProjectSelector, {
        activeProjectId: "project-1",
        onChooseRepository: vi.fn(),
        onManageProjects: vi.fn(),
        onSelectProject: vi.fn(),
        projects: [
          { id: "project-1", name: "Doolittle", color: "#ff6a00" },
          { id: "project-2", name: "Archive", color: "#00aacc" },
        ],
      }),
    );
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain("Choose project. Current project Doolittle.");
    expect(markup).not.toContain("No matching projects.");
  });

  it("filters models across provider names, display labels, and ids", () => {
    expect(filteredProviders(providers, "granite")).toEqual([
      {
        ...providers[0],
        models: providers[0]?.models,
      },
    ]);
    expect(filteredProviders(providers, "anthropic")).toEqual([providers[1]]);
    expect(filteredProviders(providers, "missing")).toEqual([]);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectList } from "./ProjectList";

const project = {
  id: "desktop",
  name: "Desktop",
  description: "Doolittle desktop work",
  instructions: "Keep the shell native.",
  primaryPath: "/work/doolittle",
  pinned: true,
  chatCount: 2,
  resources: [
    { id: "folder", kind: "folder" as const, path: "/work/doolittle" },
    { id: "readme", kind: "file" as const, path: "/work/README.md" },
  ],
};

describe("project manager presentational sections", () => {
  it("keeps project list scope semantics and archive controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectList, {
        activeScope: "desktop",
        allChatCount: 5,
        archivedCount: 1,
        onSelectProject: vi.fn(),
        onSelectScope: vi.fn(),
        onToggleArchived: vi.fn(),
        pinned: [project],
        regular: [],
        selectedId: "desktop",
        showArchived: false,
        unscopedChatCount: 2,
      }),
    );

    expect(markup).toContain('aria-label="Project list"');
    expect(markup).toContain("All chats");
    expect(markup).toContain("Pinned");
    expect(markup).toContain('class="project-manager__archive-toggle"');
    expect(markup).toContain("Archived (1)");
  });

  it("renders project detail actions, primary source, and chat handoff", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectDetail, {
        currentChatId: "chat-1",
        currentChatProjectId: "other",
        onAddFiles: vi.fn(),
        onAddFolders: vi.fn(),
        onArchive: vi.fn(),
        onEdit: vi.fn(),
        onMoveCurrentChat: vi.fn(),
        onPin: vi.fn(),
        onRemoveResource: vi.fn(),
        onSetPrimaryPath: vi.fn(),
        onUnscopeCurrentChat: vi.fn(),
        project,
        working: false,
      }),
    );

    expect(markup).toContain("Working context");
    expect(markup).toContain("Files &amp; folders");
    expect(markup).toContain("Primary");
    expect(markup).toContain("Move chat");
    expect(markup).toContain('aria-label="Remove README.md"');
  });
});

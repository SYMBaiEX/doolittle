// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type {
  ProjectLike,
  ProjectResourceLike,
} from "../../apps/desktop/src/renderer/project-manager/models";
import { ProjectDetail } from "../../apps/desktop/src/renderer/project-manager/ProjectDetail";

const noop = () => {};
const resource: ProjectResourceLike = {
  id: "resource-a",
  kind: "file",
  path: "/notes.md",
};
const project: ProjectLike = {
  id: "project-a",
  name: "Alpha",
  resources: [resource],
};

async function withDetail(
  run: (probe: {
    host: HTMLElement;
    onArchive: ReturnType<typeof vi.fn>;
    onRemoveResource: ReturnType<typeof vi.fn>;
  }) => void | Promise<void>,
) {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onArchive = vi.fn();
  const onRemoveResource = vi.fn();
  try {
    act(() =>
      root.render(
        <ProjectDetail
          project={project}
          onEdit={noop}
          onArchive={onArchive}
          onPin={noop}
          onAddFiles={noop}
          onAddFolders={noop}
          onRemoveResource={onRemoveResource}
          onSetPrimaryPath={noop}
          onMoveCurrentChat={noop}
          onUnscopeCurrentChat={noop}
          working={false}
        />,
      ),
    );
    await run({ host, onArchive, onRemoveResource });
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
}

it("confirms before removing a project resource", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    await withDetail(({ host, onRemoveResource }) => {
      const remove = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove notes.md"]',
      );
      expect(remove).toBeDefined();
      act(() => remove?.click());
      expect(onRemoveResource).not.toHaveBeenCalled();

      confirm.mockReturnValue(true);
      act(() => remove?.click());
      expect(onRemoveResource).toHaveBeenCalledWith(resource);
    });
  } finally {
    confirm.mockRestore();
  }
});

it("confirms before archiving a project", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    await withDetail(({ host, onArchive }) => {
      const archive = [...host.querySelectorAll("button")].find(
        (entry) => entry.textContent === "Archive project",
      );
      expect(archive).toBeDefined();
      act(() => archive?.click());
      expect(onArchive).not.toHaveBeenCalled();

      confirm.mockReturnValue(true);
      act(() => archive?.click());
      expect(onArchive).toHaveBeenCalledOnce();
    });
  } finally {
    confirm.mockRestore();
  }
});

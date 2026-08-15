import type { CSSProperties } from "react";
import { PROJECT_AVATAR_CLASS } from "./layout";
import { COLORS, type ProjectLike, projectLabel } from "./models";

export function ProjectAvatar({
  project,
  size = "regular",
}: {
  project: ProjectLike;
  size?: "small" | "regular";
}) {
  return (
    <span
      className={`${PROJECT_AVATAR_CLASS} ${
        size === "small"
          ? "project-avatar--small size-5 rounded-[5px] text-[11px]"
          : "project-avatar--regular size-8.5 rounded-[var(--radius-xs)] text-sm"
      }`}
      style={{ "--project-color": project.color ?? COLORS[0] } as CSSProperties}
      aria-hidden="true"
    >
      {projectLabel(project)}
    </span>
  );
}

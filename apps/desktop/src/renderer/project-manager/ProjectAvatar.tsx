import type { CSSProperties } from "react";
import { PROJECT_AVATAR_CLASS } from "./layout";
import { type ProjectLike, projectAccentColor } from "./models";
import { ProjectIconGlyph } from "./ProjectIconGlyph";

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
      style={
        {
          "--project-color": projectAccentColor(project.color),
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <ProjectIconGlyph
        project={project}
        size={size === "small" ? "xs" : "md"}
      />
    </span>
  );
}

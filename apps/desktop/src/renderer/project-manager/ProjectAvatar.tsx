import type { CSSProperties } from "react";
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
      className={`project-avatar project-avatar--${size}`}
      style={{ "--project-color": project.color ?? COLORS[0] } as CSSProperties}
      aria-hidden="true"
    >
      {projectLabel(project)}
    </span>
  );
}

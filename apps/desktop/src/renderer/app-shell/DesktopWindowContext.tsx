export interface DesktopWindowContextProps {
  sectionLabel: string;
  itemLabel: string;
  projectScopeLabel: string;
  onOpenProjectManager: () => void;
  showRouteContext: boolean;
}

export function DesktopWindowContext({
  sectionLabel,
  itemLabel,
  projectScopeLabel,
  onOpenProjectManager,
  showRouteContext,
}: DesktopWindowContextProps) {
  return (
    <>
      {showRouteContext ? (
        <>
          <span>{sectionLabel}</span>
          <strong>{itemLabel}</strong>
        </>
      ) : null}
      <button
        className={WINDOW_PROJECT_SCOPE_CLASS}
        onClick={onOpenProjectManager}
        title={`Current project scope: ${projectScopeLabel}. Change project.`}
        type="button"
      >
        {projectScopeLabel}
      </button>
    </>
  );
}

import { WINDOW_PROJECT_SCOPE_CLASS } from "./shell-layout";

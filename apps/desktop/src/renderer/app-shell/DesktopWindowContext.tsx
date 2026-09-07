import { WINDOW_PROJECT_SCOPE_CLASS } from "./shell-layout";

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
    <nav aria-label="Workspace breadcrumb">
      <ol>
        {showRouteContext ? (
          <li className="window-breadcrumb-section">{sectionLabel}</li>
        ) : null}
        <li className="window-breadcrumb-project">
          <button
            className={WINDOW_PROJECT_SCOPE_CLASS}
            onClick={onOpenProjectManager}
            title={`Current project scope: ${projectScopeLabel}. Change project.`}
            type="button"
          >
            {projectScopeLabel}
          </button>
        </li>
        <li aria-current="page" className="window-breadcrumb-current">
          {itemLabel}
        </li>
      </ol>
    </nav>
  );
}

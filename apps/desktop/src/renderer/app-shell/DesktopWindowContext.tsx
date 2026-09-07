import { ChevronLeft, ChevronRight } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import {
  WINDOW_HISTORY_CONTROLS_CLASS,
  WINDOW_PROJECT_SCOPE_CLASS,
} from "./shell-layout";

export interface DesktopWindowContextProps {
  sectionLabel: string;
  itemLabel: string;
  projectScopeLabel: string;
  canGoBack: boolean;
  canGoForward: boolean;
  backLabel?: string;
  forwardLabel?: string;
  onBack: () => void;
  onForward: () => void;
  onOpenSection: () => void;
  onOpenProjectManager: () => void;
}

export function DesktopWindowContext({
  sectionLabel,
  itemLabel,
  projectScopeLabel,
  canGoBack,
  canGoForward,
  backLabel,
  forwardLabel,
  onBack,
  onForward,
  onOpenSection,
  onOpenProjectManager,
}: DesktopWindowContextProps) {
  return (
    <div className="window-navigation">
      <fieldset className={WINDOW_HISTORY_CONTROLS_CLASS}>
        <legend className="sr-only">Navigation history</legend>
        <button
          aria-label={backLabel ? `Back to ${backLabel}` : "Go back"}
          disabled={!canGoBack}
          onClick={onBack}
          title={backLabel ? `Back to ${backLabel}` : "Go back"}
          type="button"
        >
          <UiIcon icon={ChevronLeft} size="xs" />
        </button>
        <button
          aria-label={
            forwardLabel ? `Forward to ${forwardLabel}` : "Go forward"
          }
          disabled={!canGoForward}
          onClick={onForward}
          title={forwardLabel ? `Forward to ${forwardLabel}` : "Go forward"}
          type="button"
        >
          <UiIcon icon={ChevronRight} size="xs" />
        </button>
      </fieldset>
      <nav aria-label="Workspace breadcrumb">
        <ol>
          <li className="window-breadcrumb-section">
            <button onClick={onOpenSection} type="button">
              {sectionLabel}
            </button>
          </li>
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
          <li
            aria-current="page"
            className="window-breadcrumb-current"
            title={itemLabel}
          >
            {itemLabel}
          </li>
        </ol>
      </nav>
    </div>
  );
}

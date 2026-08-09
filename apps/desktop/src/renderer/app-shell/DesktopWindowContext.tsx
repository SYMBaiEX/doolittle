export interface DesktopWindowContextProps {
  sectionLabel: string;
  itemLabel: string;
  projectScopeLabel: string;
  onOpenProjectManager: () => void;
}

export function DesktopWindowContext({
  sectionLabel,
  itemLabel,
  projectScopeLabel,
  onOpenProjectManager,
}: DesktopWindowContextProps) {
  return (
    <>
      <span>{sectionLabel}</span>
      <strong>{itemLabel}</strong>
      <button
        className="window-project-scope"
        onClick={onOpenProjectManager}
        title={`Current project scope: ${projectScopeLabel}. Change project.`}
        type="button"
      >
        {projectScopeLabel}
      </button>
    </>
  );
}

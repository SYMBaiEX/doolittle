import { FileCode2 } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import {
  gitChangeLabel,
  type RepositoryControlChange,
} from "../repository-control";

function changeDescription(change: RepositoryControlChange): string {
  if (change.untracked) return "Untracked";
  if (change.staged && change.unstaged) return "Staged and unstaged";
  return change.staged
    ? `Staged · ${gitChangeLabel(change)}`
    : gitChangeLabel(change);
}

export function ChangeFileList({
  changes,
  currentPath,
  onSelect,
}: {
  changes: readonly RepositoryControlChange[];
  currentPath?: string;
  onSelect: (path: string) => void;
}) {
  return (
    <section aria-label="Changed files" className="workspace-inspector-section">
      <header className="workspace-inspector-section-title">
        <h3>Changed files</h3>
        <span>{changes.length}</span>
      </header>
      {changes.length ? (
        <ul className="workspace-inspector-list">
          {changes.map((change) => {
            const slash = change.path.lastIndexOf("/");
            const name = change.path.slice(slash + 1);
            const folder = slash === -1 ? "" : change.path.slice(0, slash);
            const description = changeDescription(change);
            const code = change.status.trim();
            return (
              <li key={change.path}>
                <button
                  aria-current={
                    currentPath === change.path ? "true" : undefined
                  }
                  aria-label={change.path}
                  className="workspace-inspector-row workspace-inspector-change"
                  onClick={() => onSelect(change.path)}
                  title={`${change.path} · ${description}`}
                  type="button"
                >
                  <UiIcon icon={FileCode2} size="sm" />
                  <span className="workspace-inspector-label">
                    <strong>{name}</strong>
                    {folder ? <small>{folder}</small> : null}
                  </span>
                  <span
                    className="workspace-inspector-flag"
                    data-tone={
                      change.staged && !change.unstaged ? "good" : undefined
                    }
                  >
                    {change.untracked
                      ? "?"
                      : /^[A-Z]{1,2}$/u.test(code)
                        ? code
                        : "M"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="workspace-inspector-empty">Working tree is clean.</p>
      )}
    </section>
  );
}

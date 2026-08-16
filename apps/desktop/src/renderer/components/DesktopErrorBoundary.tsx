import { createLogger } from "@elizaos/logger";
import { Component, type ErrorInfo, type ReactNode } from "react";

export const RECOVERY_CARD_CLASS =
  "max-w-lg border border-[var(--border-strong)] bg-[var(--surface)] p-6";
export const RECOVERY_EYEBROW_CLASS = "text-xs font-bold text-[var(--bad)]";
export const RECOVERY_TITLE_CLASS = "text-base font-bold";
export const RECOVERY_COPY_CLASS = "mt-2 text-sm text-[var(--text-soft)]";
export const RECOVERY_ACTIONS_CLASS = "mt-4 flex gap-2 border-t pt-4";
export const RECOVERY_BUTTON_CLASS =
  "border bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold focus-visible:ring";
export const RECOVERY_PRIMARY_BUTTON_CLASS = `${RECOVERY_BUTTON_CLASS} bg-[var(--accent)] text-[var(--accent-ink)]`;
export const RECOVERY_DETAILS_CLASS = "mt-4 border-t pt-3";
export const RECOVERY_DIAGNOSTIC_CLASS =
  "my-2 max-h-44 overflow-auto whitespace-pre-wrap";

const rendererLogger = createLogger({
  namespace: "doolittle.desktop.renderer",
  __forceType: "browser",
});

interface DesktopErrorBoundaryProps {
  children: ReactNode;
}

interface DesktopErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

export function formatRendererDiagnostic(
  error: Error,
  componentStack = "",
): string {
  const stack = error.stack?.trim() || `${error.name}: ${error.message}`;
  const renderStack = componentStack.trim();
  return [
    "Doolittle desktop renderer recovery report",
    `Platform: ${window.doolittle.platform}`,
    `Route: ${window.location.hash || "#/dashboard"}`,
    `Time: ${new Date().toISOString()}`,
    "",
    stack,
    renderStack ? `\nComponent stack:\n${renderStack}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export class DesktopErrorBoundary extends Component<
  DesktopErrorBoundaryProps,
  DesktopErrorBoundaryState
> {
  state: DesktopErrorBoundaryState = {
    error: null,
    componentStack: "",
    copied: false,
  };

  static getDerivedStateFromError(
    error: Error,
  ): Partial<DesktopErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? "" });
    rendererLogger.error(
      {
        context: {
          error: error.message,
          componentStack: info.componentStack ?? "",
        },
      },
      "Doolittle renderer recovered from an error.",
    );
  }

  private reload = (): void => {
    window.location.reload();
  };

  private returnHome = (): void => {
    window.location.hash = "#/dashboard";
    window.location.reload();
  };

  private copyDiagnostic = async (): Promise<void> => {
    const { error, componentStack } = this.state;
    if (!error) return;
    try {
      await navigator.clipboard.writeText(
        formatRendererDiagnostic(error, componentStack),
      );
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  render(): ReactNode {
    const { children } = this.props;
    const { error, copied } = this.state;
    if (!error) return children;

    return (
      <main
        className="recovery-shell grid min-h-screen place-items-center bg-[var(--bg)] p-6 text-[var(--text)]"
        data-recovery-scope="desktop"
      >
        <p className="sr-only" role="alert">
          Doolittle encountered a rendering error. Recovery actions are
          available.
        </p>
        <section className={RECOVERY_CARD_CLASS}>
          <p className={RECOVERY_EYEBROW_CLASS}>DESKTOP RECOVERY</p>
          <h1 className={RECOVERY_TITLE_CLASS}>Doolittle hit a snag.</h1>
          <p className={RECOVERY_COPY_CLASS}>
            Your workspace and conversations are safe. Reload the desktop or
            return home to continue.
          </p>
          <div className={RECOVERY_ACTIONS_CLASS}>
            <button
              className={RECOVERY_PRIMARY_BUTTON_CLASS}
              onClick={this.reload}
              type="button"
            >
              Reload Doolittle
            </button>
            <button
              className={RECOVERY_BUTTON_CLASS}
              onClick={this.returnHome}
              type="button"
            >
              Return home
            </button>
          </div>
          <details className={`recovery-details ${RECOVERY_DETAILS_CLASS}`}>
            <summary>Technical details</summary>
            <pre className={RECOVERY_DIAGNOSTIC_CLASS}>
              {error.message || error.name}
            </pre>
            <button
              className={RECOVERY_BUTTON_CLASS}
              onClick={this.copyDiagnostic}
              type="button"
            >
              {copied ? "Diagnostic copied" : "Copy diagnostic"}
            </button>
          </details>
        </section>
      </main>
    );
  }
}

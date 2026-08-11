import { createLogger } from "@elizaos/logger";
import { Component, type ErrorInfo, type ReactNode } from "react";

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
      <main className="recovery-shell">
        <p className="sr-only" role="alert">
          Doolittle encountered a rendering error. Recovery actions are
          available.
        </p>
        <div className="recovery-glow" aria-hidden="true" />
        <section className="recovery-card">
          <div className="recovery-mark" aria-hidden="true">
            D
          </div>
          <p className="recovery-eyebrow">DESKTOP RECOVERY</p>
          <h1>Doolittle hit a snag.</h1>
          <p className="recovery-copy">
            Your workspace and conversations are safe. Reload the desktop or
            return home to continue.
          </p>
          <div className="recovery-actions">
            <button
              type="button"
              className="recovery-primary"
              onClick={this.reload}
            >
              Reload Doolittle
            </button>
            <button type="button" onClick={this.returnHome}>
              Return home
            </button>
          </div>
          <details className="recovery-details">
            <summary>Technical details</summary>
            <pre>{error.message || error.name}</pre>
            <button type="button" onClick={this.copyDiagnostic}>
              {copied ? "Diagnostic copied" : "Copy diagnostic"}
            </button>
          </details>
        </section>
      </main>
    );
  }
}

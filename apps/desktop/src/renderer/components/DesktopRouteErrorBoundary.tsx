import { createLogger } from "@elizaos/logger";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { formatRendererDiagnostic } from "./DesktopErrorBoundary";

const rendererLogger = createLogger({
  namespace: "doolittle.desktop.renderer.route",
  __forceType: "browser",
});

export interface DesktopRouteErrorBoundaryProps {
  children: ReactNode;
  label: string;
  onReturnToChat: () => void;
  onRetry?: () => void;
  resetKey: string;
}

interface DesktopRouteErrorBoundaryState {
  componentStack: string;
  copied: boolean;
  error: Error | null;
  resetKey: string;
}

export class DesktopRouteErrorBoundary extends Component<
  DesktopRouteErrorBoundaryProps,
  DesktopRouteErrorBoundaryState
> {
  state: DesktopRouteErrorBoundaryState = {
    componentStack: "",
    copied: false,
    error: null,
    resetKey: "",
  };

  static getDerivedStateFromError(
    error: Error,
  ): Partial<DesktopRouteErrorBoundaryState> {
    return { error, copied: false };
  }

  static getDerivedStateFromProps(
    props: DesktopRouteErrorBoundaryProps,
    state: DesktopRouteErrorBoundaryState,
  ): Partial<DesktopRouteErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null;
    return {
      componentStack: "",
      copied: false,
      error: null,
      resetKey: props.resetKey,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? "" });
    rendererLogger.error(
      {
        context: {
          error: error.message,
          componentStack: info.componentStack ?? "",
          route: this.props.label,
        },
      },
      "Doolittle route recovered from a render error.",
    );
  }

  private retry = (): void => {
    this.props.onRetry?.();
    this.setState({ componentStack: "", copied: false, error: null });
  };

  private returnToChat = (): void => {
    this.props.onReturnToChat();
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
    const { children, label } = this.props;
    const { copied, error } = this.state;
    if (!error) return children;

    return (
      <section
        aria-labelledby="route-recovery-title"
        className="route-recovery recovery-card"
      >
        <p className="sr-only" role="alert">
          The {label} view encountered a rendering error. Recovery actions are
          available.
        </p>
        <div aria-hidden="true" className="recovery-mark">
          D
        </div>
        <p className="recovery-eyebrow">ROUTE RECOVERY</p>
        <h1 id="route-recovery-title">{label} needs a restart.</h1>
        <p className="recovery-copy">
          The rest of Doolittle is still available. Retry this view or return to
          Chat without reloading the desktop.
        </p>
        <div className="recovery-actions">
          <button
            className="recovery-primary"
            onClick={this.retry}
            type="button"
          >
            Retry {label}
          </button>
          <button onClick={this.returnToChat} type="button">
            Return to Chat
          </button>
        </div>
        <details className="recovery-details">
          <summary>Technical details</summary>
          <pre>{error.message || error.name}</pre>
          <button onClick={this.copyDiagnostic} type="button">
            {copied ? "Diagnostic copied" : "Copy diagnostic"}
          </button>
        </details>
      </section>
    );
  }
}

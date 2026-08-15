import { createLogger } from "@elizaos/logger";
import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  formatRendererDiagnostic,
  RECOVERY_ACTIONS_CLASS,
  RECOVERY_BUTTON_CLASS,
  RECOVERY_CARD_CLASS,
  RECOVERY_COPY_CLASS,
  RECOVERY_DETAILS_CLASS,
  RECOVERY_DIAGNOSTIC_CLASS,
  RECOVERY_EYEBROW_CLASS,
  RECOVERY_PRIMARY_BUTTON_CLASS,
  RECOVERY_TITLE_CLASS,
} from "./DesktopErrorBoundary";

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
        className={`recovery-shell ${RECOVERY_CARD_CLASS} mx-auto my-[clamp(20px,5vw,56px)]`}
        data-recovery-scope="route"
      >
        <p className="sr-only" role="alert">
          The {label} view encountered a rendering error. Recovery actions are
          available.
        </p>
        <p className={RECOVERY_EYEBROW_CLASS}>ROUTE RECOVERY</p>
        <h1 className={RECOVERY_TITLE_CLASS} id="route-recovery-title">
          {label} needs a restart.
        </h1>
        <p className={RECOVERY_COPY_CLASS}>
          The rest of Doolittle is still available. Retry this view or return to
          Chat without reloading the desktop.
        </p>
        <div className={RECOVERY_ACTIONS_CLASS}>
          <button
            className={RECOVERY_PRIMARY_BUTTON_CLASS}
            onClick={this.retry}
            type="button"
          >
            Retry {label}
          </button>
          <button
            className={RECOVERY_BUTTON_CLASS}
            onClick={this.returnToChat}
            type="button"
          >
            Return to Chat
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
    );
  }
}

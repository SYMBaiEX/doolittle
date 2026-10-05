import type { UiHostV1 } from "@doolittle/contracts/ui-host";
import { Button, StateSurface, type UiRendererProps } from "@doolittle/ui";
import {
  Component,
  type ComponentType,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DesktopUiInterfaceBridge,
  UiInterfaceState,
} from "../../shared/ui-interface";
import { NativeUiHost } from "./native-ui-host";

class RendererBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function TrustedInterface({
  bridge,
  entryUrl,
  visible,
  onFailure,
}: {
  bridge: DesktopUiInterfaceBridge;
  entryUrl: string;
  visible: boolean;
  onFailure: () => void;
}) {
  const visibility = useRef(visible);
  visibility.current = visible;
  const native = useMemo(() => new NativeUiHost(bridge), [bridge]);
  useEffect(() => () => native.dispose(), [native]);
  const host = useMemo<UiHostV1>(
    () => ({
      version: 1,
      getSnapshot: native.getSnapshot,
      subscribe: (listener, after) => native.subscribe(listener, after),
      dispatch: (command) =>
        visibility.current
          ? native.dispatch(command)
          : Promise.reject(
              new Error(
                "The interface is not active. Background commands are disabled.",
              ),
            ),
    }),
    [native],
  );
  const Renderer = useMemo<ComponentType<UiRendererProps>>(
    () =>
      lazy(async () => {
        const { loadTrustedRenderer } = await import("./trusted-renderer");
        return { default: await loadTrustedRenderer(entryUrl) };
      }),
    [entryUrl],
  );
  return (
    <RendererBoundary onFailure={onFailure}>
      <Suspense
        fallback={<StateSurface kind="loading" title="Opening interface…" />}
      >
        <Renderer host={host} />
      </Suspense>
    </RendererBoundary>
  );
}

/** Native application remains mounted. Switching presentation never closes runs or resources. */
export function InterfaceHost({
  children,
  bridge = window.doolittle.ui,
}: {
  children: ReactNode;
  bridge?: DesktopUiInterfaceBridge;
}) {
  const [state, setState] = useState<UiInterfaceState>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let disposed = false;
    let observed = false;
    const detach = bridge.onState((next) => {
      observed = true;
      if (!disposed) setState(next);
    });
    void bridge
      .getState()
      .then((next) => {
        if (!disposed && !observed) setState(next);
      })
      .catch(() => {
        if (!disposed)
          setError(
            "Interface settings are unavailable. The default interface remains open.",
          );
      });
    return () => {
      disposed = true;
      detach();
    };
  }, [bridge]);
  const alternate = !!state && state.mode !== "default";
  const nativeVisible = !alternate || !!state?.hostSurface;
  const operate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch {
      setError(
        "The interface operation failed. Use the native Interface menu to restore the default interface.",
      );
    } finally {
      setBusy(false);
    }
  };
  const recover = () => {
    if (bridge) void operate(() => bridge.restore());
  };
  const settings = () => {
    if (!bridge) return;
    void operate(async () => {
      await bridge.restore();
      document.documentElement.dataset.interfaceSettings = "true";
      window.dispatchEvent(new CustomEvent("doolittle:interface-settings"));
    });
  };
  useEffect(() => {
    document.documentElement.dataset.nativeInterfaceVisible =
      String(nativeVisible);
    return () => {
      delete document.documentElement.dataset.nativeInterfaceVisible;
    };
  }, [nativeVisible]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {alternate || state?.safeMode || state?.recovery || error ? (
        <header
          className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 pt-0 text-sm data-[mac=true]:pl-20"
          data-mac={window.doolittle.platform === "darwin"}
        >
          <span
            className="min-w-0 flex-1 truncate"
            role={error ? "alert" : undefined}
            title={error || state?.recovery}
          >
            {error ||
              state?.recovery ||
              (state?.safeMode
                ? "Safe mode · default interface"
                : state?.active?.name)}
          </span>
          {state?.hostSurface && alternate && bridge ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void operate(() => bridge.returnToInterface())}
            >
              Back
            </Button>
          ) : null}
          {alternate ? (
            <Button
              variant="ghost"
              aria-label="Restore default interface"
              disabled={busy}
              onClick={recover}
            >
              Restore
            </Button>
          ) : null}
          {alternate && bridge ? (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void operate(() => bridge.stopAll())}
              >
                Stop all
              </Button>
              <Button
                className="max-[640px]:hidden"
                variant="ghost"
                disabled={busy}
                onClick={settings}
              >
                Settings
              </Button>
            </>
          ) : null}
        </header>
      ) : null}
      <div
        className="min-h-0 flex-1"
        hidden={!nativeVisible}
        inert={!nativeVisible}
      >
        {children}
      </div>
      {state?.mode === "trusted-react" && state.entryUrl && bridge ? (
        <div
          className="min-h-0 flex-1"
          hidden={nativeVisible}
          inert={nativeVisible}
        >
          <TrustedInterface
            key={state.entryUrl}
            bridge={bridge}
            entryUrl={state.entryUrl}
            visible={!nativeVisible}
            onFailure={recover}
          />
        </div>
      ) : null}
    </div>
  );
}

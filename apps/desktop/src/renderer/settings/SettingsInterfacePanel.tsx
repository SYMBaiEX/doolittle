import type { UiConversation } from "@doolittle/contracts/ui-host";
import type { UiPluginCapability } from "@doolittle/contracts/ui-plugin";
import { Button, StateSurface } from "@doolittle/ui";
import { useEffect, useId, useRef, useState } from "react";
import type {
  InstalledUiInterface,
  UiInterfaceState,
} from "../../shared/ui-interface";

const capabilityLabels: Record<UiPluginCapability, string> = {
  "conversation.read": "Read conversations and agent output",
  "message.send": "Send messages and initiate agent actions",
  "run.stop": "Stop runs in the selected conversations",
  "attachment.pick": "Open the native attachment picker",
  "surface.open": "Open host-owned Details, Library and Computer",
};
const keyFor = (item: UiConversation) =>
  JSON.stringify([item.botId, item.sessionId, item.projectId ?? null]);

/** Approval remains native. This form only proposes exact scopes and capabilities. */
export function SettingsInterfacePanel() {
  const bridge = window.doolittle.ui;
  const [state, setState] = useState<UiInterfaceState>();
  const [conversations, setConversations] = useState<UiConversation[]>([]);
  const [selected, setSelected] = useState<InstalledUiInterface>();
  const [capabilities, setCapabilities] = useState<UiPluginCapability[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const stateRevisionRef = useRef(0);
  const snapshotRevisionRef = useRef(0);
  const selectionRef = useRef(selected);
  selectionRef.current = selected;
  const permissionDescriptionId = useId();
  const permissionHeadingRef = useRef<HTMLHeadingElement>(null);
  const interfaceHeadingRef = useRef<HTMLHeadingElement>(null);
  const permissionTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected) permissionHeadingRef.current?.focus();
    else if (permissionTriggerRef.current) {
      const trigger = permissionTriggerRef.current;
      if (!trigger.disabled && trigger.isConnected) trigger.focus();
      else interfaceHeadingRef.current?.focus();
    }
  }, [selected]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry revision reloads host-owned state.
  useEffect(() => {
    if (!bridge) return;
    let disposed = false;
    mountedRef.current = true;
    let observed = false;
    const detach = bridge.onState((next) => {
      observed = true;
      stateRevisionRef.current += 1;
      if (!disposed) {
        setState(next);
        setError((current) =>
          current === "Interface settings could not be loaded." ? "" : current,
        );
        const pending = selectionRef.current;
        if (
          pending &&
          (next.safeMode ||
            !next.installed.some(
              (item) => item.identity.digest === pending.identity.digest,
            ))
        ) {
          snapshotRevisionRef.current += 1;
          setSelected(undefined);
          setSnapshotReady(false);
          setCapabilities([]);
          setTargets([]);
        }
      }
    });
    void bridge
      .getState()
      .then((next) => {
        if (!disposed && !observed) {
          setState(next);
          setError("");
        }
      })
      .catch(() => {
        if (!disposed && !observed)
          setError("Interface settings could not be loaded.");
      });
    return () => {
      disposed = true;
      mountedRef.current = false;
      snapshotRevisionRef.current += 1;
      detach();
    };
  }, [bridge, loadRevision]);
  const operate = async (operation: () => Promise<UiInterfaceState>) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setError("");
    const revision = stateRevisionRef.current;
    try {
      const next = await operation();
      if (!mountedRef.current) return;
      if (revision === stateRevisionRef.current) setState(next);
      setSelected(undefined);
      setSnapshotReady(false);
    } catch {
      if (mountedRef.current)
        setError(
          "The operation could not be confirmed. Check the native Interface menu for the current state and recovery options.",
        );
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };
  const choose = async (item: InstalledUiInterface) => {
    if (!bridge || inFlightRef.current || state?.safeMode) return;
    if (item.trustTier === "trusted-react") {
      void operate(() => bridge.activate({ identity: item.identity }));
      return;
    }
    selectionRef.current = item;
    setSelected(item);
    setCapabilities([]);
    setTargets([]);
    setConversations([]);
    setError("");
    setSnapshotReady(false);
    inFlightRef.current = true;
    const revision = ++snapshotRevisionRef.current;
    setBusy(true);
    try {
      const snapshot = await bridge.getSnapshot();
      if (!mountedRef.current || revision !== snapshotRevisionRef.current)
        return;
      setConversations(snapshot.conversations);
      setSnapshotReady(true);
    } catch {
      if (mountedRef.current && revision === snapshotRevisionRef.current)
        setError(
          "Conversations could not be loaded. Access cannot be granted until ownership is available.",
        );
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };
  if (!bridge)
    return (
      <StateSurface kind="offline" title="Native interfaces are unavailable">
        Use Doolittle's desktop application to install or manage interfaces.
      </StateSurface>
    );
  return (
    <section
      className="settings-group dl-settings-group"
      aria-label="Application interfaces"
      aria-busy={busy}
    >
      <header className="grid gap-2">
        <h2
          className="m-0 text-base font-semibold"
          ref={interfaceHeadingRef}
          tabIndex={-1}
        >
          Your interface
        </h2>
        <p className="m-0 max-w-170 text-sm leading-relaxed text-[var(--muted)]">
          Companion and Canvas share the same conversations and capabilities.
          Choose them in Appearance. Optional interface packages change the
          presentation, not the owner of your work.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void operate(() => bridge.install())}
          >
            Install local interface
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void operate(() => bridge.restore())}
          >
            Restore default interface
          </Button>
        </div>
        {state?.safeMode ? (
          <p role="status" className="m-0 text-sm">
            Safe mode is active. Restart normally to enable extensions.
          </p>
        ) : null}
        {state?.recovery ? (
          <p role="status" className="m-0 text-sm">
            {state.recovery}
          </p>
        ) : null}
        {error ? (
          <div className="grid gap-2">
            <p role="alert" className="m-0 text-sm text-[var(--bad)]">
              {error}
            </p>
            {!state ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setLoadRevision((revision) => revision + 1);
                }}
              >
                Retry interface settings
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>
      {!state && !error ? (
        <StateSurface kind="loading" title="Loading interfaces…" />
      ) : null}
      {state && !state.installed.length ? (
        <StateSurface kind="empty" title="No optional interfaces installed">
          The built-in interface is ready. Install a verified local package when
          you want another layout.
        </StateSurface>
      ) : null}
      {state?.installed.length ? (
        <ul className="m-0 list-none divide-y divide-[var(--border)] p-0">
          {state.installed.map((item) => (
            <li
              key={item.identity.digest}
              className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <h3 className="m-0 text-sm font-semibold">
                  {item.name}{" "}
                  <span className="font-normal text-[var(--muted)]">
                    {item.identity.pluginVersion}
                  </span>
                </h3>
                {state.active?.identity.digest === item.identity.digest ? (
                  <span className="settings-status-note">Currently active</span>
                ) : null}
                <p className="my-1 text-sm text-[var(--muted)]">
                  {item.trustTier === "trusted-react"
                    ? "Full application trust · not sandboxed"
                    : "Isolated community interface · explicit conversation access"}
                </p>
                <code
                  className="block break-all text-xs text-[var(--muted)]"
                  title="Exact artifact digest"
                >
                  {item.identity.digest}
                </code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy || state.safeMode}
                  title={
                    state.safeMode
                      ? "Restart without safe mode to use optional interfaces"
                      : undefined
                  }
                  onClick={(event) => {
                    permissionTriggerRef.current = event.currentTarget;
                    void choose(item);
                  }}
                >
                  Use interface
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void operate(() => bridge.revoke(item.identity))
                  }
                >
                  Revoke access
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <form
          className="grid gap-4 border-t border-[var(--border)] pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              inFlightRef.current ||
              !snapshotReady ||
              state?.safeMode ||
              !capabilities.length ||
              !targets.length ||
              !state?.installed.some(
                (item) => item.identity.digest === selected.identity.digest,
              )
            )
              return;
            const ownedTargets = conversations
              .filter((item) => targets.includes(keyFor(item)))
              .map(({ botId, sessionId, projectId }) => ({
                botId,
                sessionId,
                ...(projectId ? { projectId } : {}),
              }));
            void operate(() =>
              bridge.activate({
                identity: selected.identity,
                capabilities,
                targets: ownedTargets,
              }),
            );
          }}
          aria-describedby={permissionDescriptionId}
        >
          <h3
            className="m-0 text-base font-semibold"
            ref={permissionHeadingRef}
            tabIndex={-1}
          >
            Allow {selected.name} to use…
          </h3>
          <p
            id={permissionDescriptionId}
            className="m-0 text-sm leading-relaxed text-[var(--muted)]"
          >
            Sending permission lets this interface initiate agent actions
            without asking each time. Select only the access and conversations
            you want to share. No future conversations or background commands
            are included. Final approval is shown by the native application.
          </p>
          {busy && !snapshotReady ? (
            <p className="settings-status-note" role="status">
              Loading owned conversations…
            </p>
          ) : null}
          {!busy && !snapshotReady ? (
            <Button variant="ghost" onClick={() => void choose(selected)}>
              Retry conversation access
            </Button>
          ) : null}
          <fieldset className="m-0 grid gap-1 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">Capabilities</legend>
            {selected.requestedCapabilities.map((capability) => (
              <label
                key={capability}
                className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={capabilities.includes(capability)}
                  disabled={busy}
                  onChange={(event) =>
                    setCapabilities((current) =>
                      event.target.checked
                        ? [...current, capability]
                        : current.filter((value) => value !== capability),
                    )
                  }
                />
                {capabilityLabels[capability]}
              </label>
            ))}
          </fieldset>
          <fieldset className="m-0 grid gap-1 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">
              Conversations
            </legend>
            {conversations.map((item) => (
              <label
                key={keyFor(item)}
                className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={targets.includes(keyFor(item))}
                  disabled={busy}
                  onChange={(event) =>
                    setTargets((current) =>
                      event.target.checked
                        ? [...current, keyFor(item)]
                        : current.filter((value) => value !== keyFor(item)),
                    )
                  }
                />
                <span className="min-w-0 break-words">
                  {item.title}
                  <span className="block text-[var(--muted)]">
                    {item.botId} · {item.sessionId}
                  </span>
                </span>
              </label>
            ))}
            {!busy && snapshotReady && !conversations.length ? (
              <p className="text-sm text-[var(--muted)]">
                Create a conversation first. Interfaces cannot receive a
                wildcard grant.
              </p>
            ) : null}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={
                busy ||
                !snapshotReady ||
                Boolean(state?.safeMode) ||
                !capabilities.length ||
                !targets.length
              }
              title={
                !snapshotReady
                  ? "Load owned conversations before reviewing access"
                  : !capabilities.length || !targets.length
                    ? "Choose at least one capability and one conversation"
                    : undefined
              }
            >
              Review native approval
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setSelected(undefined)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      <p className="m-0 text-sm leading-relaxed text-[var(--muted)]">
        Recovery is always host-owned: Interface → Restore default interface
        (⌘⇧R), or launch with <code>--safe-ui</code>. Revoking access preserves
        conversations and running work.
      </p>
    </section>
  );
}

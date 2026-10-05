import type { UiConversation } from "@doolittle/contracts/ui-host";
import type { UiPluginCapability } from "@doolittle/contracts/ui-plugin";
import { Button, StateSurface } from "@doolittle/ui";
import { useEffect, useState } from "react";
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
        if (!disposed) setError("Interface settings could not be loaded.");
      });
    return () => {
      disposed = true;
      detach();
    };
  }, [bridge]);
  const operate = async (operation: () => Promise<UiInterfaceState>) => {
    setBusy(true);
    setError("");
    try {
      setState(await operation());
    } catch {
      setError(
        "The operation could not be completed. No new interface access was granted. Check the native Interface menu for recovery.",
      );
    } finally {
      setBusy(false);
    }
  };
  const choose = async (item: InstalledUiInterface) => {
    if (!bridge) return;
    if (item.trustTier === "trusted-react") {
      void operate(() => bridge.activate({ identity: item.identity }));
      return;
    }
    setSelected(item);
    setCapabilities([]);
    setTargets([]);
    setConversations([]);
    setError("");
    setBusy(true);
    try {
      setConversations((await bridge.getSnapshot()).conversations);
    } catch {
      setError(
        "Conversations could not be loaded. Access cannot be granted until ownership is available.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (!bridge)
    return (
      <StateSurface kind="offline" title="Native interfaces are unavailable">
        Use Doolittle's desktop application to install or manage interfaces.
      </StateSurface>
    );
  return (
    <section className="grid min-w-0 gap-6" aria-label="Application interfaces">
      <header className="grid gap-2">
        <h2 className="m-0 text-base font-semibold">Your interface</h2>
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
          <p role="alert" className="m-0 text-sm text-[var(--bad)]">
            {error}
          </p>
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
                  onClick={() => void choose(item)}
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
        >
          <h3 className="m-0 text-base font-semibold">
            Allow {selected.name} to use…
          </h3>
          <p className="m-0 text-sm leading-relaxed text-[var(--muted)]">
            Sending permission lets this interface initiate agent actions
            without asking each time. Select only the access and conversations
            you want to share. No future conversations or background commands
            are included. Final approval is shown by the native application.
          </p>
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
            {!busy && !conversations.length ? (
              <p className="text-sm text-[var(--muted)]">
                Create a conversation first. Interfaces cannot receive a
                wildcard grant.
              </p>
            ) : null}
          </fieldset>
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={busy || !capabilities.length || !targets.length}
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

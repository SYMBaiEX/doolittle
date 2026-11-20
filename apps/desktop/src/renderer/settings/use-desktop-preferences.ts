import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DesktopLifecycleState,
  DesktopUpdateState,
} from "../../shared/contracts";
import { errorMessage } from "../lib";
import type { DesktopSettingsPanelProps } from "./DesktopSettingsPanel";

type UpdateOperation = { action: "check" | "download" | "install" };

export function useDesktopPreferences(
  enabled: boolean,
): DesktopSettingsPanelProps {
  const [lifecycle, setLifecycle] = useState<DesktopLifecycleState | null>(
    null,
  );
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const savingLifecycle = useRef(false);
  const lifecycleRevision = useRef(0);
  const [update, setUpdate] = useState<DesktopUpdateState | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<UpdateOperation | null>(
    null,
  );
  const updateOperation = useRef<UpdateOperation | null>(null);
  const updateEventRevision = useRef(0);

  const reloadLifecycle = useCallback(async () => {
    if (savingLifecycle.current) return;
    const revision = ++lifecycleRevision.current;
    setLifecycleError("");
    try {
      const next = await window.doolittle.getLifecycleState();
      if (lifecycleRevision.current === revision) setLifecycle(next);
    } catch {
      if (lifecycleRevision.current === revision) {
        setLifecycleError(
          "Desktop behavior could not be loaded. Retry to manage background work.",
        );
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reloadLifecycle();
    return () => {
      lifecycleRevision.current += 1;
    };
  }, [enabled, reloadLifecycle]);

  const finishUpdate = useCallback((operation: UpdateOperation) => {
    if (updateOperation.current !== operation) return;
    updateOperation.current = null;
    setPendingUpdate(null);
  }, []);
  // An install can report failure after the user switches settings sections.
  const watchUpdates = enabled || pendingUpdate?.action === "install";
  useEffect(() => {
    if (!watchUpdates) return;
    let disposed = false;
    const revision = updateEventRevision.current;
    const unsubscribe = window.doolittle.onUpdateState((next) => {
      if (disposed) return;
      updateEventRevision.current += 1;
      const pending = updateOperation.current;
      if (pending?.action === "install" && next.phase === "error")
        finishUpdate(pending);
      setUpdate(next);
    });
    void window.doolittle.getUpdateState().then(
      (next) => {
        if (!disposed && updateEventRevision.current === revision)
          setUpdate(next);
      },
      () => {
        if (!disposed && updateEventRevision.current === revision) {
          setUpdate({
            phase: "error",
            message:
              "Update status could not be loaded. Check for updates to retry.",
          });
        }
      },
    );
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [finishUpdate, watchUpdates]);

  const saveLifecycle = async (keepRunning: boolean) => {
    if (savingLifecycle.current) return;
    savingLifecycle.current = true;
    lifecycleRevision.current += 1;
    setLifecycleBusy(true);
    setLifecycleError("");
    try {
      setLifecycle(
        await window.doolittle.setKeepRunningInBackground(keepRunning),
      );
    } catch {
      setLifecycle(null);
      setLifecycleError(
        "Background behavior could not be confirmed. Retry desktop state before changing it again.",
      );
    } finally {
      savingLifecycle.current = false;
      setLifecycleBusy(false);
    }
  };

  const runUpdate = async (action: UpdateOperation["action"]) => {
    if (updateOperation.current) return;
    const operation = { action };
    updateOperation.current = operation;
    setPendingUpdate(operation);
    const revision = ++updateEventRevision.current;
    try {
      if (action === "install") {
        await window.doolittle.installUpdate();
        return;
      }
      const next = await (action === "check"
        ? window.doolittle.checkForUpdates()
        : window.doolittle.downloadUpdate());
      if (updateEventRevision.current === revision) setUpdate(next);
    } catch (error) {
      if (updateOperation.current === operation)
        setUpdate({ phase: "error", message: errorMessage(error) });
      finishUpdate(operation);
    } finally {
      if (action !== "install") finishUpdate(operation);
    }
  };

  return {
    lifecycle,
    lifecycleBusy,
    lifecycleError,
    onLifecycleRetry: () => void reloadLifecycle(),
    onBackgroundChange: (keepRunning) => void saveLifecycle(keepRunning),
    onCheckUpdates: () => void runUpdate("check"),
    onDownloadUpdate: () => void runUpdate("download"),
    onInstallUpdate: () => void runUpdate("install"),
    update:
      update && pendingUpdate?.action === "install"
        ? { ...update, message: "Installing update and restarting Doolittle…" }
        : update,
    updateBusy: pendingUpdate !== null,
  };
}

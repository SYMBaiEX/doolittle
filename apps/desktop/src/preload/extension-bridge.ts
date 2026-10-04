import type {
  UiHostCommand,
  UiHostEvent,
  UiHostResult,
  UiSnapshot,
} from "@doolittle/contracts/ui-host";
import { contextBridge, ipcRenderer } from "electron";

// Deliberately no window.doolittle, generic IPC, network, path, or approval API.
const CHANNELS = {
  snapshot: "doolittle-ui:snapshot",
  dispatch: "doolittle-ui:dispatch",
  subscribe: "doolittle-ui:subscribe",
  unsubscribe: "doolittle-ui:unsubscribe",
  event: "doolittle-ui:event",
} as const;

interface ExtensionBridge {
  readonly version: 1;
  getSnapshot(): Promise<UiSnapshot>;
  dispatch(command: UiHostCommand): Promise<UiHostResult>;
  subscribe(listener: (event: UiHostEvent) => void, after?: number): () => void;
}

const bridge: ExtensionBridge = Object.freeze({
  version: 1 as const,
  getSnapshot: () => ipcRenderer.invoke(CHANNELS.snapshot),
  dispatch: (command: UiHostCommand) =>
    ipcRenderer.invoke(CHANNELS.dispatch, command),
  subscribe(listener: (event: UiHostEvent) => void, after?: number) {
    let closed = false;
    let subscriptionId: string | undefined;
    let lastSequence = after ?? -1;
    const queued: Array<{ id: string; value: UiHostEvent }> = [];
    const deliver = (payload: { id: string; value: UiHostEvent }) => {
      if (
        closed ||
        payload.id !== subscriptionId ||
        payload.value.sequence <= lastSequence
      )
        return;
      lastSequence = payload.value.sequence;
      listener(payload.value);
    };
    const onEvent = (
      _event: Electron.IpcRendererEvent,
      payload: { id: string; value: UiHostEvent },
    ) => {
      if (!subscriptionId) queued.push(payload);
      else deliver(payload);
    };
    ipcRenderer.on(CHANNELS.event, onEvent);
    void ipcRenderer
      .invoke(CHANNELS.subscribe, after)
      .then((id: string) => {
        if (closed) {
          void ipcRenderer.invoke(CHANNELS.unsubscribe, id);
          return;
        }
        subscriptionId = id;
        for (const value of queued) deliver(value);
        queued.length = 0;
      })
      .catch(() => {
        ipcRenderer.removeListener(CHANNELS.event, onEvent);
      });
    return () => {
      if (closed) return;
      closed = true;
      ipcRenderer.removeListener(CHANNELS.event, onEvent);
      if (subscriptionId)
        void ipcRenderer.invoke(CHANNELS.unsubscribe, subscriptionId);
    };
  },
});

contextBridge.exposeInMainWorld("doolittleUI", bridge);

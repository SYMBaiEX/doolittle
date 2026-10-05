import type {
  UiHostEvent,
  UiHostSubscription,
  UiHostV1,
} from "@doolittle/contracts/ui-host";
import type { DesktopUiInterfaceBridge } from "../../shared/ui-interface";

/** Lives outside replaceable renderers. Disposal detaches observers, never runs. */
export class NativeUiHost implements UiHostV1 {
  readonly version = 1 as const;
  private readonly subscriptions = new Set<() => void>();
  constructor(private readonly bridge: DesktopUiInterfaceBridge) {}

  getSnapshot: UiHostV1["getSnapshot"] = () => this.bridge.getSnapshot();
  dispatch: UiHostV1["dispatch"] = (command) => this.bridge.dispatch(command);

  subscribe(
    listener: (event: UiHostEvent) => void,
    after?: number,
  ): UiHostSubscription {
    const id = crypto.randomUUID();
    let closed = false;
    let lastSequence = after ?? -1;
    // Listener registration precedes IPC. The known stable subscription ID lets
    // replay arrive before acknowledgement without dropping or guessing events.
    const detach = this.bridge.onEvent((event) => {
      if (
        closed ||
        event.subscriptionId !== id ||
        event.value.sequence <= lastSequence
      )
        return;
      lastSequence = event.value.sequence;
      listener(event.value);
    });
    const unsubscribe = (() => {
      if (closed) return;
      closed = true;
      detach();
      this.subscriptions.delete(unsubscribe);
      void this.bridge.unsubscribe(id).catch(() => undefined);
    }) as UiHostSubscription;
    this.subscriptions.add(unsubscribe);
    const ready = this.bridge
      .subscribe(id, after)
      .then(() => {
        if (closed) return this.bridge.unsubscribe(id);
      })
      .catch((error: unknown) => {
        unsubscribe();
        throw error;
      });
    Object.defineProperty(unsubscribe, "ready", { value: ready });
    // Simple UI consumers may only use unsubscribe. AG-UI and submission paths
    // await the original promise and receive the transport error before sending.
    void ready.catch(() => undefined);
    return unsubscribe;
  }

  dispose(): void {
    for (const unsubscribe of [...this.subscriptions]) unsubscribe();
  }
}

import type { UiHostV1, UiTarget } from "@doolittle/contracts/ui-host";

/** Serialized host-backed text; presentation caches and attachment leases remain host-owned. */
export class NativeDraftBridge {
  private readonly lanes = new Map<
    string,
    { pending: Promise<void>; initialized: boolean; text?: string }
  >();
  constructor(
    private readonly options: {
      host: UiHostV1;
      bind: (target: UiTarget) => Promise<void>;
      revision: (sessionId: string) => number;
      apply: (target: UiTarget, text: string) => void;
    },
  ) {}
  private enqueue(
    target: UiTarget,
    operation: (lane: { initialized: boolean; text?: string }) => Promise<void>,
  ) {
    const key = JSON.stringify([
      target.botId,
      target.sessionId,
      target.projectId ?? null,
    ]);
    let lane = this.lanes.get(key);
    if (!lane) {
      lane = { pending: Promise.resolve(), initialized: false };
      this.lanes.set(key, lane);
    }
    const current = lane;
    const pending = current.pending
      .catch(() => undefined)
      .then(() => operation(current));
    current.pending = pending;
    return pending;
  }
  sync(target: UiTarget, text: string, revision: number): Promise<void> {
    const captured = { ...target };
    return this.enqueue(captured, async (lane) => {
      if (this.options.revision(captured.sessionId) !== revision) return;
      if (!lane.initialized) {
        await this.options.bind(captured);
        const result = await this.options.host.dispatch({
          type: "draft.read",
          target: captured,
        });
        if (!result.accepted || !result.draft)
          throw new Error("Draft state is unavailable.");
        lane.initialized = true;
        if (result.draft.exists) {
          lane.text = result.draft.text;
          if (this.options.revision(captured.sessionId) === revision)
            this.options.apply(captured, result.draft.text);
          return;
        }
      }
      if (
        this.options.revision(captured.sessionId) !== revision ||
        lane.text === text
      )
        return;
      const result = await this.options.host.dispatch({
        type: "draft.update",
        target: captured,
        text,
      });
      if (!result.accepted) throw new Error("Draft state could not be saved.");
      lane.text = text;
    });
  }
  refresh(target: UiTarget): Promise<void> {
    const captured = { ...target };
    const revision = this.options.revision(captured.sessionId);
    return this.enqueue(captured, async (lane) => {
      const result = await this.options.host.dispatch({
        type: "draft.read",
        target: captured,
      });
      if (!result.accepted || !result.draft?.exists) return;
      lane.initialized = true;
      lane.text = result.draft.text;
      if (this.options.revision(captured.sessionId) === revision)
        this.options.apply(captured, result.draft.text);
    });
  }
}

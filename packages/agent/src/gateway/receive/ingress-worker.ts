import type { IncomingPlatformMessage } from "@/types/gateway";
import {
  type GatewayIngressSpool,
  sanitizeIngressError,
} from "./ingress-spool";
import type { GatewayReceiveResult } from "./types";

export class GatewayIngressWorker {
  private controller: AbortController | undefined;
  private drainPromise: Promise<void> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private stalled = false;
  /** Fairly rotate retrying receipts so one transient provider turn cannot starve later work. */
  private retryCursor: string | undefined;

  constructor(
    private readonly spool: GatewayIngressSpool,
    private readonly receive: (
      message: IncomingPlatformMessage,
      options: {
        abortSignal: AbortSignal;
        preserveIdempotencyDisposition: true;
      },
    ) => Promise<GatewayReceiveResult>,
  ) {}

  start(): void {
    if (!this.controller) {
      this.controller = new AbortController();
      this.stalled = false;
      this.spool.markInterrupted();
    }
    this.kick();
  }

  kick(): void {
    if (!this.controller || this.drainPromise) return;
    this.drainPromise = this.drain()
      .catch((error) => {
        // Provider receipt is already committed. Never leave a detached rejected
        // promise; best-effort visibility is handled at the failing transition.
        void sanitizeIngressError(error);
      })
      .finally(() => {
        this.drainPromise = undefined;
        if (
          this.controller &&
          !this.stalled &&
          !this.retryTimer &&
          this.spool.pending().length > 0
        )
          this.kick();
      });
  }

  async stop(): Promise<void> {
    this.controller?.abort();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    await this.drainPromise;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.controller = undefined;
  }

  async idle(): Promise<void> {
    await this.drainPromise;
  }

  private async drain(): Promise<void> {
    while (!this.controller?.signal.aborted) {
      const controller = this.controller;
      if (!controller) return;
      const pending = this.nextPending();
      if (!pending) return;
      let entry: ReturnType<GatewayIngressSpool["claim"]>;
      try {
        entry = this.spool.claim(pending.receiptId);
      } catch (error) {
        this.safeStatus(pending, "failed", sanitizeIngressError(error));
        this.stalled = true;
        return;
      }
      if (!entry) continue;
      if (!entry.message) {
        this.safeStatus(entry, "failed", "Inbound payload is unavailable.");
        this.stalled = true;
        return;
      }
      try {
        const result = await this.receive(entry.message, {
          abortSignal: controller.signal,
          preserveIdempotencyDisposition: true,
        });
        if (result.idempotencyDisposition === "transient") {
          this.retry(entry, "Inbound receive is transient.");
          return;
        }
        try {
          this.spool.setStatus(
            entry,
            result.deliveryStatus === "rejected" ? "rejected" : "completed",
          );
        } catch (error) {
          this.safeStatus(entry, "failed", sanitizeIngressError(error));
          this.stalled = true;
        }
      } catch (error) {
        // Keep the durable message for the next explicit/lifecycle drain. This
        // avoids an unbounded hot loop after a provider outage.
        this.retry(entry, sanitizeIngressError(error));
        return;
      }
    }
  }

  private retry(
    entry: Parameters<GatewayIngressSpool["setStatus"]>[0],
    error: string,
  ): void {
    if (this.controller?.signal.aborted) {
      this.safeStatus(entry, "interrupted", error);
      return;
    }
    try {
      this.spool.setStatus(entry, "retrying", error);
    } catch (statusError) {
      this.safeStatus(entry, "failed", sanitizeIngressError(statusError));
      return;
    }
    this.retryCursor = entry.receiptId;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(entry.attempts, 5));
    const timer = setTimeout(() => {
      if (this.retryTimer !== timer) return;
      this.retryTimer = undefined;
      this.kick();
    }, delay);
    this.retryTimer = timer;
    timer.unref?.();
  }

  private nextPending():
    | ReturnType<GatewayIngressSpool["pending"]>[number]
    | undefined {
    const pending = this.spool.pending(!this.retryTimer);
    const queued = pending.find((entry) => entry.status === "queued");
    if (queued) return queued;
    if (!this.retryCursor) return pending[0];
    const cursor = pending.findIndex(
      (entry) => entry.receiptId === this.retryCursor,
    );
    return pending[(cursor + 1) % pending.length] ?? pending[0];
  }

  private safeStatus(
    entry: Parameters<GatewayIngressSpool["setStatus"]>[0],
    status: "failed" | "interrupted",
    error: string,
  ): void {
    try {
      this.spool.setStatus(entry, status, error);
    } catch {
      // The durable record remains in its previous state, but the worker's
      // drain rejection is contained and will not become an unhandled promise.
    }
  }
}

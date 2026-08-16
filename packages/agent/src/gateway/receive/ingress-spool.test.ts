import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingPlatformMessage } from "@/types/gateway";
import { GatewayIngressError, GatewayIngressSpool } from "./ingress-spool";
import { GatewayIngressWorker } from "./ingress-worker";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function spool(): GatewayIngressSpool {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-ingress-"));
  directories.push(directory);
  return new GatewayIngressSpool(directory);
}

function message(
  overrides: Partial<IncomingPlatformMessage> = {},
): IncomingPlatformMessage {
  return {
    platform: "slack",
    userId: "U1",
    roomId: "C1",
    text: "hello",
    messageId: "m1",
    ...overrides,
  };
}

describe("GatewayIngressSpool", () => {
  it("returns the same receipt for the same identity and exact payload", () => {
    const journal = spool();
    const first = journal.accept(message());
    const duplicate = journal.accept(message());
    expect(duplicate).toEqual({ ...first, duplicate: true });
    expect(journal.pending()).toHaveLength(1);
  });

  it("rejects reuse of an identity with a different payload digest", () => {
    const journal = spool();
    journal.accept(message());
    expect(() => journal.accept(message({ text: "changed" }))).toThrow(
      GatewayIngressError,
    );
    try {
      journal.accept(message({ text: "changed" }));
    } catch (error) {
      expect((error as GatewayIngressError).code).toBe("digest_conflict");
    }
  });

  it("uses a canonical digest so metadata key order does not conflict", () => {
    const journal = spool();
    const first = journal.accept(message({ metadata: { a: "1", b: "2" } }));
    expect(journal.accept(message({ metadata: { b: "2", a: "1" } }))).toEqual({
      ...first,
      duplicate: true,
    });
  });

  it("recovers queued messages but makes an interrupted claim visible without rerunning it", async () => {
    const journal = spool();
    const queued = journal.accept(message({ messageId: "queued" }));
    const processing = journal.accept(message({ messageId: "processing" }));
    journal.claim(processing.receiptId);
    const calls: string[] = [];
    const worker = new GatewayIngressWorker(journal, async (inbound) => {
      calls.push(inbound.messageId ?? "");
      return { ok: true, response: "done" };
    });
    worker.start();
    await worker.idle();
    expect(calls).toEqual(["queued"]);
    expect(journal.history()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          receiptId: queued.receiptId,
          status: "completed",
        }),
        expect.objectContaining({
          receiptId: processing.receiptId,
          status: "interrupted",
        }),
      ]),
    );
    await worker.stop();
  });

  it("does not begin a worker run when aborted before the durable commit", () => {
    const journal = spool();
    const controller = new AbortController();
    controller.abort();
    expect(() => journal.accept(message(), controller.signal)).toThrow(
      GatewayIngressError,
    );
    expect(journal.pending()).toHaveLength(0);
  });

  it("keeps a receive failure recoverable and only exposes a bounded preview", async () => {
    const journal = spool();
    journal.accept(message({ text: "x".repeat(500) }));
    const worker = new GatewayIngressWorker(journal, async () => {
      throw new Error(
        "Authorization: Bearer provider-secret\nshould not spill",
      );
    });
    worker.start();
    await worker.idle();
    const [entry] = journal.history();
    expect(entry.status).toBe("retrying");
    expect(entry.preview).toHaveLength(280);
    expect(entry.error).toBe("Authorization: [redacted] should not spill");
    await worker.stop();
  });

  it("compacts terminal payloads while preserving restart duplicate receipts", () => {
    const directory = mkdtempSync(join(tmpdir(), "doolittle-ingress-"));
    directories.push(directory);
    const journal = new GatewayIngressSpool(directory);
    const attachmentUrl = "https://private.example/unique-attachment-token";
    const receipt = journal.accept(
      message({
        text: "x".repeat(500),
        attachments: [{ url: attachmentUrl } as never],
      }),
    );
    const entry = journal.claim(receipt.receiptId);
    expect(entry).toBeDefined();
    if (!entry) throw new Error("Expected queued ingress entry.");
    journal.setStatus(entry, "completed");
    const raw = readFileSync(journal.pathname, "utf8");
    expect(raw).not.toContain("x".repeat(281));
    expect(raw).not.toContain(attachmentUrl);
    const restarted = new GatewayIngressSpool(directory);
    expect(
      restarted.accept(
        message({
          text: "x".repeat(500),
          attachments: [{ url: attachmentUrl } as never],
        }),
      ),
    ).toEqual({
      ...receipt,
      duplicate: true,
      status: "completed",
    });
    expect(restarted.history()[0]?.preview).toHaveLength(280);
  });

  it("bounds terminal tombstones without discarding actionable payloads", () => {
    const directory = mkdtempSync(join(tmpdir(), "doolittle-ingress-"));
    directories.push(directory);
    const journal = new GatewayIngressSpool(directory, 2);
    const pendingText = "pending-payload-must-survive";
    journal.accept(message({ messageId: "pending", text: pendingText }));

    const receipts = ["terminal-1", "terminal-2", "terminal-3"].map(
      (messageId) => {
        const receipt = journal.accept(message({ messageId, text: messageId }));
        const entry = journal.claim(receipt.receiptId);
        if (!entry) throw new Error("Expected queued ingress entry.");
        journal.setStatus(entry, "completed");
        return receipt;
      },
    );

    expect(journal.history(10)).toHaveLength(3);
    expect(journal.history(10).map((entry) => entry.receiptId)).not.toContain(
      receipts[0]?.receiptId,
    );
    expect(
      journal.accept(message({ messageId: "terminal-3", text: "terminal-3" })),
    ).toMatchObject({
      receiptId: receipts[2]?.receiptId,
      duplicate: true,
      status: "completed",
    });
    expect(
      journal.accept(message({ messageId: "terminal-1", text: "terminal-1" })),
    ).toMatchObject({
      receiptId: receipts[0]?.receiptId,
      duplicate: false,
      status: "queued",
    });
    expect(readFileSync(journal.pathname, "utf8")).toContain(pendingText);
  });

  it("passes a worker-owned abort signal and waits for the tracked receive on stop", async () => {
    const journal = spool();
    journal.accept(message());
    let release!: () => void;
    let signal: AbortSignal | undefined;
    const worker = new GatewayIngressWorker(
      journal,
      async (_message, options) => {
        signal = options.abortSignal;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { ok: true, response: "done" };
      },
    );
    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stopping = worker.stop();
    expect(signal?.aborted).toBe(true);
    let stopped = false;
    void stopping.then(() => {
      stopped = true;
    });
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);
  });

  it("retries an internal transient receive outcome instead of completing it", async () => {
    const journal = spool();
    journal.accept(message());
    const worker = new GatewayIngressWorker(journal, async () => ({
      ok: false,
      response: "retry",
      idempotencyDisposition: "transient",
    }));
    worker.start();
    await worker.idle();
    expect(journal.history()[0]).toMatchObject({ status: "retrying" });
    await worker.stop();
  });

  it("does not bypass an existing retry backoff when new work is accepted", async () => {
    vi.useFakeTimers();
    const journal = spool();
    journal.accept(message({ messageId: "retry-first" }));
    const calls: string[] = [];
    const worker = new GatewayIngressWorker(journal, async (inbound) => {
      const messageId = inbound.messageId ?? "";
      calls.push(messageId);
      if (
        messageId === "retry-first" &&
        calls.filter((value) => value === messageId).length === 1
      ) {
        return {
          ok: false,
          response: "retry",
          idempotencyDisposition: "transient",
        };
      }
      return { ok: true, response: "done" };
    });
    try {
      worker.start();
      await worker.idle();
      expect(calls).toEqual(["retry-first"]);
      expect(vi.getTimerCount()).toBe(1);

      journal.accept(message({ messageId: "queued-second" }));
      worker.start();
      await worker.idle();
      expect(calls).toEqual(["retry-first", "queued-second"]);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(1_999);
      expect(calls).toEqual(["retry-first", "queued-second"]);
      await vi.advanceTimersByTimeAsync(1);
      await worker.idle();
      expect(calls).toEqual(["retry-first", "queued-second", "retry-first"]);
    } finally {
      await worker.stop();
      vi.useRealTimers();
    }
  });

  it("contains claim and terminal journal failures after provider acknowledgement", async () => {
    const entry = {
      receiptId: "receipt",
      key: "key",
      digest: "digest",
      message: message(),
      status: "queued" as const,
      attempts: 0,
    };
    const claimFailure = {
      pending: () => [entry],
      claim: () => {
        throw new Error("disk unavailable");
      },
      setStatus: () => {
        throw new Error("disk unavailable");
      },
      markInterrupted: () => undefined,
    } as unknown as GatewayIngressSpool;
    const worker = new GatewayIngressWorker(claimFailure, async () => ({
      ok: true,
      response: "done",
    }));
    worker.start();
    await expect(worker.idle()).resolves.toBeUndefined();
    await worker.stop();
  });

  it("fairly rotates retrying receipts", async () => {
    vi.useFakeTimers();
    try {
      const journal = spool();
      journal.accept(message({ messageId: "first" }));
      const secondReceipt = journal.accept(message({ messageId: "second" }));
      const seen: string[] = [];
      const worker = new GatewayIngressWorker(journal, async (inbound) => {
        seen.push(inbound.messageId ?? "");
        const attempts = seen.filter(
          (messageId) => messageId === inbound.messageId,
        ).length;
        return inbound.messageId === "first" || attempts === 1
          ? {
              ok: false,
              response: "retry",
              idempotencyDisposition: "transient",
            }
          : { ok: true, response: "done" };
      });
      worker.start();
      await worker.idle();
      await vi.advanceTimersByTimeAsync(2_000);
      await worker.idle();
      expect(seen).toEqual(["first", "second"]);
      expect(
        journal.history(10).filter((entry) => entry.status === "retrying"),
      ).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(2_000);
      await worker.idle();
      expect(seen).toEqual(["first", "second", "first"]);

      await vi.advanceTimersByTimeAsync(4_000);
      await worker.idle();
      expect(seen.slice(0, 4)).toEqual(["first", "second", "first", "second"]);
      expect(journal.history(10)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            receiptId: secondReceipt.receiptId,
            status: "completed",
          }),
        ]),
      );
      await worker.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

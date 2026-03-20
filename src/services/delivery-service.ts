import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeliveredMessageRecord, DeliveryTarget } from "@/types";

interface DeliveryStore {
  messages: DeliveredMessageRecord[];
}

export class DeliveryService {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "deliveries.json");
    if (!existsSync(this.filePath)) {
      this.write({ messages: [] });
    }
  }

  deliver(
    target: DeliveryTarget,
    text: string,
    extras?: {
      threadId?: string;
      replyToId?: string;
      metadata?: Record<string, string>;
    },
  ): DeliveredMessageRecord {
    const store = this.read();
    const record: DeliveredMessageRecord = {
      id: randomUUID(),
      target,
      text,
      threadId: extras?.threadId,
      replyToId: extras?.replyToId,
      metadata: extras?.metadata,
      createdAt: new Date().toISOString(),
    };
    store.messages.push(record);
    if (store.messages.length > 500) {
      store.messages = store.messages.slice(-500);
    }
    this.write(store);
    return record;
  }

  recent(limit = 25): DeliveredMessageRecord[] {
    return this.read().messages.slice(-limit).reverse();
  }

  get(deliveryId: string): DeliveredMessageRecord | undefined {
    return this.read().messages.find((record) => record.id === deliveryId);
  }

  update(
    deliveryId: string,
    text: string,
    extras?: {
      threadId?: string;
      replyToId?: string;
      metadata?: Record<string, string>;
    },
  ): DeliveredMessageRecord {
    const store = this.read();
    const existing = store.messages.find((record) => record.id === deliveryId);
    if (!existing) {
      throw new Error(`Delivery ${deliveryId} was not found.`);
    }

    const record: DeliveredMessageRecord = {
      ...existing,
      text,
      threadId: extras?.threadId ?? existing.threadId,
      replyToId: extras?.replyToId ?? existing.replyToId,
      metadata: {
        ...(existing.metadata ?? {}),
        ...(extras?.metadata ?? {}),
      },
      updatedAt: new Date().toISOString(),
      editOfId: existing.editOfId ?? existing.id,
      editCount: (existing.editCount ?? 0) + 1,
    };

    const index = store.messages.findIndex((entry) => entry.id === deliveryId);
    store.messages[index] = record;
    this.write(store);
    return record;
  }

  private read(): DeliveryStore {
    const raw = readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as DeliveryStore;
  }

  private write(store: DeliveryStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}

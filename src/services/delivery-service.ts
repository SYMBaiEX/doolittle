import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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

  deliver(target: DeliveryTarget, text: string): DeliveredMessageRecord {
    const store = this.read();
    const record: DeliveredMessageRecord = {
      id: randomUUID(),
      target,
      text,
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

  private read(): DeliveryStore {
    const raw = readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as DeliveryStore;
  }

  private write(store: DeliveryStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}

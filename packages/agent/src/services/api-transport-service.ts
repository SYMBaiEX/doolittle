import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ApiResponseRecord {
  id: string;
  roomId: string;
  userId: string;
  input: string;
  outputText: string;
  previousResponseId?: string;
  createdAt: string;
  metadata?: Record<string, string>;
}

interface ApiTransportStore {
  responses: ApiResponseRecord[];
}

interface ApiTransportUpdateEvent {
  type: "create";
  record: ApiResponseRecord;
}

export interface ApiTransportCreateInput {
  input: string;
  outputText: string;
  userId: string;
  roomId?: string;
  previousResponseId?: string;
  metadata?: Record<string, string>;
}

export class ApiTransportService {
  private readonly storePath: string;
  private readonly maxRecords = 300;
  private readonly listeners = new Set<
    (event: ApiTransportUpdateEvent) => void
  >();

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.storePath = join(rootDir, "responses.json");
    if (!existsSync(this.storePath)) {
      this.write({ responses: [] });
    }
  }

  create(input: ApiTransportCreateInput): ApiResponseRecord {
    const store = this.read();
    const previous = input.previousResponseId
      ? store.responses.find((entry) => entry.id === input.previousResponseId)
      : undefined;
    const record: ApiResponseRecord = {
      id: `resp_${randomUUID().replace(/-/gu, "")}`,
      roomId: input.roomId ?? previous?.roomId ?? `api:${input.userId}`,
      userId: input.userId,
      input: input.input,
      outputText: input.outputText,
      previousResponseId: input.previousResponseId,
      createdAt: new Date().toISOString(),
      metadata: input.metadata,
    };
    store.responses.push(record);
    if (store.responses.length > this.maxRecords) {
      store.responses = store.responses.slice(-this.maxRecords);
    }
    this.write(store);
    this.emit({
      type: "create",
      record,
    });
    return record;
  }

  get(id: string): ApiResponseRecord | undefined {
    return this.read().responses.find((entry) => entry.id === id);
  }

  list(limit = 25): ApiResponseRecord[] {
    return this.read().responses.slice(-limit).reverse();
  }

  resolveRoomId(previousResponseId?: string, fallbackUserId?: string): string {
    if (previousResponseId) {
      const existing = this.get(previousResponseId);
      if (existing) {
        return existing.roomId;
      }
    }
    return `api:${fallbackUserId ?? "user"}`;
  }

  onUpdate(listener: (event: ApiTransportUpdateEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private read(): ApiTransportStore {
    const raw = JSON.parse(
      readFileSync(this.storePath, "utf8"),
    ) as Partial<ApiTransportStore>;
    return {
      responses: raw.responses ?? [],
    };
  }

  private write(store: ApiTransportStore): void {
    writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf8");
  }

  private emit(event: ApiTransportUpdateEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

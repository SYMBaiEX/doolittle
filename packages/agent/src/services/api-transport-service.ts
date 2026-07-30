import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ApiResponseRecord {
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

export type ApiTransportContinuation =
  | { ok: true; roomId: string }
  | {
      ok: false;
      code: "response_not_found" | "response_user_mismatch";
      status: 403 | 404;
      error: string;
    };

export interface ApiTransportCreateInput {
  id?: string;
  input: string;
  outputText: string;
  userId: string;
  roomId?: string;
  previousResponseId?: string;
  metadata?: Record<string, string>;
}

export function createApiResponseId(): string {
  return `resp_${randomUUID().replace(/-/gu, "")}`;
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
      id: input.id ?? createApiResponseId(),
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

  resolveContinuation(
    previousResponseId: string | undefined,
    userId: string,
  ): ApiTransportContinuation {
    if (!previousResponseId) {
      return { ok: true, roomId: `api:${userId}` };
    }
    const existing = this.get(previousResponseId);
    if (!existing) {
      return {
        ok: false,
        code: "response_not_found",
        status: 404,
        error: "previous_response_id was not found",
      };
    }
    if (existing.userId !== userId) {
      return {
        ok: false,
        code: "response_user_mismatch",
        status: 403,
        error: "previous_response_id belongs to another user",
      };
    }
    return { ok: true, roomId: existing.roomId };
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

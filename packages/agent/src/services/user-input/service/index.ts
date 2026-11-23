import { randomUUID } from "node:crypto";
import { UserInputRequestStore } from "../store";
import type {
  CreateUserInputRequestInput,
  UserInputAnswer,
  UserInputRequest,
  UserInputRequestStatus,
} from "../types";

export type { UserInputRequest } from "../types";

const MAX_RETAINED_RESOLVED = 50;
const MAX_RETAINED_REQUESTS = 200;

export class UserInputRequestService {
  private readonly store: UserInputRequestStore;

  constructor(baseDir: string) {
    this.store = new UserInputRequestStore(baseDir);
  }

  request(input: CreateUserInputRequestInput): UserInputRequest {
    const data = this.store.read();
    const record: UserInputRequest = {
      id: randomUUID(),
      roomId: input.roomId,
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.botId ? { botId: input.botId } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.mutationObligation ? { mutationObligation: true } : {}),
      questions: input.questions,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    data.requests.push(record);
    this.store.write({ requests: pruneRequests(data.requests) });
    return record;
  }

  list(status?: UserInputRequestStatus, roomId?: string): UserInputRequest[] {
    return this.store
      .read()
      .requests.filter(
        (record) =>
          (!status || record.status === status) &&
          (!roomId || record.roomId === roomId),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(id: string): UserInputRequest | undefined {
    return this.store.read().requests.find((record) => record.id === id);
  }

  latestPendingForSession(sessionId: string): UserInputRequest | undefined {
    const pending = this.list("pending").filter(
      (record) => record.sessionId === sessionId || record.roomId === sessionId,
    );
    return pending[pending.length - 1];
  }

  pendingForRun(runId: string): UserInputRequest | undefined {
    return this.list("pending").find((record) => record.runId === runId);
  }

  answer(id: string, answers: UserInputAnswer[]): UserInputRequest {
    return this.resolve(id, "answered", (record) => ({
      ...record,
      answers,
    }));
  }

  dismiss(id: string): UserInputRequest {
    return this.resolve(id, "dismissed");
  }

  /**
   * A fresh user turn in the session supersedes still-open requests: the user
   * answered (or redirected) in chat instead of the input selector.
   */
  supersedePendingForSession(sessionId: string): number {
    const data = this.store.read();
    let superseded = 0;
    const requests = data.requests.map((record) => {
      if (
        record.status !== "pending" ||
        (record.sessionId !== sessionId && record.roomId !== sessionId)
      )
        return record;
      superseded += 1;
      return {
        ...record,
        status: "superseded" as const,
        resolvedAt: new Date().toISOString(),
      };
    });
    if (superseded > 0) {
      this.store.write({ requests: pruneRequests(requests) });
    }
    return superseded;
  }

  private resolve(
    id: string,
    status: "answered" | "dismissed",
    patch?: (record: UserInputRequest) => UserInputRequest,
  ): UserInputRequest {
    const data = this.store.read();
    const index = data.requests.findIndex((record) => record.id === id);
    if (index < 0) throw new Error("input request not found");
    const current = data.requests[index];
    if (current.status !== "pending") {
      throw new Error(`input request is already ${current.status}`);
    }
    const resolved: UserInputRequest = {
      ...(patch ? patch(current) : current),
      status,
      resolvedAt: new Date().toISOString(),
    };
    const requests = [...data.requests];
    requests[index] = resolved;
    this.store.write({ requests: pruneRequests(requests) });
    return resolved;
  }
}

function pruneRequests(requests: UserInputRequest[]): UserInputRequest[] {
  if (requests.length <= MAX_RETAINED_REQUESTS) return requests;
  const pending = requests.filter((record) => record.status === "pending");
  const resolved = requests
    .filter((record) => record.status !== "pending")
    .slice(-MAX_RETAINED_RESOLVED);
  const retained = new Set([...pending, ...resolved]);
  return requests.filter((record) => retained.has(record));
}

/**
 * Compose the message a client sends on the user's behalf after they answer
 * in the input selector. Mutation-obligation turns keep their workspace
 * verification contract on the follow-up turn; other turns stay plain chat.
 */
export function formatInputAnswerSubmission(
  request: UserInputRequest,
  answers: readonly UserInputAnswer[],
): string {
  const lines = answers.slice(0, 8).map((answer, index) => {
    const custom = answer.customText?.trim();
    const chosen = answer.selected
      .map((label) => label.trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(", ");
    const detail = [chosen, custom].filter(Boolean).join(" — ");
    return `${index + 1}. ${answer.question.trim()}: ${detail || "No preference"}`;
  });
  const intro = request.mutationObligation
    ? "Implement the requested project work with my decisions:"
    : "My decisions for your questions:";
  return [intro, "", ...lines].join("\n");
}

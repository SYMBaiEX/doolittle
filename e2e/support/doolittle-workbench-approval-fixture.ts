import type { ElectronApplication } from "@playwright/test";
import { desktopIpcChannels } from "../../apps/desktop/src/shared/ipc-channels";

const FIXTURE_PREFIX = "Doolittle session workbench approval E2E fixture:";
const FIXTURE_STATE = "__doolittleSessionWorkbenchApprovalFixtureV1";

export interface SyntheticApprovalDecision {
  id: string;
  decision: "approve" | "deny";
}

/**
 * Replace only the isolated Electron process's API transport handler for this
 * approval-presentation test. This is a deterministic renderer fixture, not
 * evidence about provider behavior, backend concurrency, or command execution.
 */
export async function installSyntheticApprovalFixture(
  app: ElectronApplication,
  sessionIds: readonly [string, string],
): Promise<void> {
  if (
    sessionIds.length !== 2 ||
    !sessionIds[0] ||
    !sessionIds[1] ||
    sessionIds[0] === sessionIds[1]
  ) {
    throw new Error(
      "Synthetic approval fixture requires two distinct sessions.",
    );
  }

  await app.evaluate(
    ({ ipcMain }, fixture) => {
      type FixtureApproval = {
        id: string;
        platform: string;
        userId: string;
        roomId: string;
        sessionKey?: string;
        command: string;
        reason: string;
        createdAt: string;
        expiresAt: string;
        status: "pending" | "approved" | "denied";
      };

      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const records: FixtureApproval[] = [
        {
          id: "approval-session-a",
          platform: "api",
          userId: "synthetic-e2e-user",
          roomId: fixture.sessionIds[0],
          sessionKey: fixture.sessionIds[0],
          command: "fixture inspect session A",
          reason: `${fixture.prefix} attributable to session A`,
          createdAt: now,
          expiresAt,
          status: "pending",
        },
        {
          id: "approval-session-a-keyboard",
          platform: "api",
          userId: "synthetic-e2e-user",
          roomId: fixture.sessionIds[0],
          sessionKey: fixture.sessionIds[0],
          command: "fixture keyboard decision for session A",
          reason: `${fixture.prefix} keyboard decision coverage`,
          createdAt: now,
          expiresAt,
          status: "pending",
        },
        {
          id: "approval-session-a-long-copy",
          platform: "api",
          userId: "synthetic-e2e-user",
          roomId: fixture.sessionIds[0],
          sessionKey: fixture.sessionIds[0],
          command: `${fixture.prefix} ${"inspect-a-long-protected-target ".repeat(7)}`,
          reason: `${fixture.prefix} ${"The session-scoped decision remains attached to this request when copy wraps at a narrow panel width. ".repeat(2)}`,
          createdAt: now,
          expiresAt,
          status: "pending",
        },
        {
          id: "approval-session-b",
          platform: "api",
          userId: "synthetic-e2e-user",
          roomId: fixture.sessionIds[1],
          sessionKey: fixture.sessionIds[1],
          command: "fixture inspect session B",
          reason: `${fixture.prefix} attributable to session B`,
          createdAt: now,
          expiresAt,
          status: "pending",
        },
        {
          id: "approval-unattributed",
          platform: "api",
          userId: "synthetic-e2e-user",
          roomId: "",
          command: "fixture review unattributed request",
          reason: `${fixture.prefix} remains in global Review`,
          createdAt: now,
          expiresAt,
          status: "pending",
        },
      ];
      const decisions: SyntheticApprovalDecision[] = [];
      let listCalls = 0;
      let failListRequests = true;
      let boundSessionIds = [...fixture.sessionIds];

      const response = (status: number, value: unknown) => ({
        status,
        statusText: status === 200 ? "OK" : "Synthetic fixture error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });

      const delay = (milliseconds: number) =>
        new Promise<void>((resolveDelay) => {
          setTimeout(resolveDelay, milliseconds);
        });

      const rebindSessions = (nextSessionIds: readonly [string, string]) => {
        boundSessionIds = [...nextSessionIds];
        for (const record of records) {
          if (record.id.startsWith("approval-session-a")) {
            record.roomId = boundSessionIds[0];
            record.sessionKey = boundSessionIds[0];
          } else if (record.id === "approval-session-b") {
            record.roomId = boundSessionIds[1];
            record.sessionKey = boundSessionIds[1];
          }
        }
      };

      ipcMain.removeHandler(fixture.invoke.agentRequest);
      ipcMain.handle(
        fixture.invoke.agentRequest,
        async (_event, unsafeRequest: unknown) => {
          if (!unsafeRequest || typeof unsafeRequest !== "object") {
            throw new Error("Invalid synthetic approval fixture request.");
          }
          const request = unsafeRequest as {
            requestId?: unknown;
            path?: unknown;
            method?: unknown;
          };
          if (
            typeof request.requestId !== "string" ||
            request.requestId.length === 0 ||
            typeof request.path !== "string" ||
            typeof request.method !== "string"
          ) {
            throw new Error("Invalid synthetic approval fixture request.");
          }

          if (
            request.method === "GET" &&
            request.path === "/execution/approvals?status=pending"
          ) {
            listCalls += 1;
            if (failListRequests) {
              await delay(1_500);
              return response(503, {
                error: `${fixture.prefix} temporary list failure`,
              });
            }
            await delay(700);
            return response(200, {
              approvals: records.filter(
                (record) => record.status === "pending",
              ),
            });
          }

          if (
            request.method === "GET" &&
            request.path === "/execution/approvals"
          ) {
            return response(200, { approvals: records });
          }

          if (request.method === "POST") {
            const match =
              /^\/execution\/approvals\/([^/?#]+)\/(approve|deny)$/u.exec(
                request.path,
              );
            if (!match) {
              throw new Error("Unexpected mutation reached approval fixture.");
            }
            const id = decodeURIComponent(match[1] ?? "");
            const decision = match[2] as "approve" | "deny";
            const record = records.find((candidate) => candidate.id === id);
            if (record?.status !== "pending") {
              return response(404, {
                error: "Unknown or non-pending synthetic approval ID.",
              });
            }
            await delay(500);
            record.status = decision === "approve" ? "approved" : "denied";
            decisions.push({ id, decision });
            return response(200, { approval: record });
          }

          throw new Error(
            `Unexpected request reached approval fixture: ${request.method} ${request.path}`,
          );
        },
      );

      Object.defineProperty(globalThis, fixture.stateKey, {
        configurable: true,
        value: {
          decisions,
          listCalls: () => listCalls,
          releaseListFailure: () => {
            failListRequests = false;
          },
          rebindSessions,
        },
      });
    },
    {
      invoke: desktopIpcChannels.invoke,
      sessionIds,
      prefix: FIXTURE_PREFIX,
      stateKey: FIXTURE_STATE,
    },
  );
}

export async function syntheticApprovalFixtureState(
  app: ElectronApplication,
): Promise<{ decisions: SyntheticApprovalDecision[]; listCalls: number }> {
  return app.evaluate((_electron, stateKey) => {
    const state = (globalThis as Record<string, unknown>)[stateKey] as
      | {
          decisions?: SyntheticApprovalDecision[];
          listCalls?: () => number;
          releaseListFailure?: () => void;
          rebindSessions?: (nextSessionIds: readonly [string, string]) => void;
        }
      | undefined;
    return {
      decisions: state?.decisions ?? [],
      listCalls: state?.listCalls?.() ?? 0,
    };
  }, FIXTURE_STATE);
}

/** Allow later list reads to succeed after the synthetic initial 503 path. */
export async function releaseSyntheticApprovalListFailure(
  app: ElectronApplication,
): Promise<void> {
  await app.evaluate((_electron, stateKey) => {
    const state = (globalThis as Record<string, unknown>)[stateKey] as
      | { releaseListFailure?: () => void }
      | undefined;
    state?.releaseListFailure?.();
  }, FIXTURE_STATE);
}

/** Rebind synthetic DTOs to the two session IDs restored by the app under test. */
export async function rebindSyntheticApprovalSessions(
  app: ElectronApplication,
  sessionIds: readonly [string, string],
): Promise<void> {
  await app.evaluate(
    (_electron, parameters) => {
      const state = (globalThis as Record<string, unknown>)[
        parameters.stateKey
      ] as
        | {
            rebindSessions?: (
              nextSessionIds: readonly [string, string],
            ) => void;
          }
        | undefined;
      state?.rebindSessions?.(parameters.sessionIds);
    },
    { stateKey: FIXTURE_STATE, sessionIds },
  );
}

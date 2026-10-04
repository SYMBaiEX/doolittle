import type { ElectronApplication } from "@playwright/test";
import { desktopIpcChannels } from "../../apps/desktop/src/shared/ipc-channels";

export type SyntheticChatMode = "running" | "waiting" | "failed" | "complete";

const FIXTURE_PREFIX = "Doolittle session workbench E2E fixture:";
const FIXTURE_TEXT =
  "Synthetic E2E renderer fixture only; this is not a model response.";

export function syntheticChatPrompt(mode: SyntheticChatMode): string {
  return `${FIXTURE_PREFIX} ${mode}`;
}

/**
 * Replace only the isolated Electron process's chat handlers. These
 * deterministic events exercise renderer lifecycle presentation; they do not
 * measure model quality, provider behavior, or backend concurrency.
 */
export async function installSyntheticChatLifecycleFixture(
  app: ElectronApplication,
): Promise<void> {
  await app.evaluate(
    ({ ipcMain }, fixture) => {
      const active = new Map<
        string,
        {
          mode: string;
          roomId: string;
          sender: Electron.WebContents;
          startedAt: string;
        }
      >();
      ipcMain.removeHandler(fixture.invoke.chatStart);
      ipcMain.removeHandler(fixture.invoke.chatCancel);
      ipcMain.handle(fixture.invoke.chatStart, (event, value: unknown) => {
        if (!value || typeof value !== "object") {
          throw new Error("Invalid synthetic chat fixture request.");
        }
        const request = value as {
          requestId?: unknown;
          roomId?: unknown;
          message?: unknown;
        };
        const requestId =
          typeof request.requestId === "string" ? request.requestId : "";
        const sessionId =
          typeof request.roomId === "string" ? request.roomId : "";
        const message =
          typeof request.message === "string" ? request.message : "";
        if (
          !requestId ||
          !sessionId ||
          !message.startsWith(`${fixture.prefix} `)
        ) {
          throw new Error("Unexpected request reached synthetic chat fixture.");
        }

        const mode = message.slice(fixture.prefix.length + 1);
        if (
          mode !== "running" &&
          mode !== "waiting" &&
          mode !== "failed" &&
          mode !== "complete"
        ) {
          throw new Error("Unknown synthetic chat fixture mode.");
        }

        const now = new Date().toISOString();
        const terminal = mode === "failed" || mode === "complete";
        const status =
          mode === "waiting"
            ? "waiting"
            : mode === "failed"
              ? "error"
              : mode === "complete"
                ? "complete"
                : "thinking";
        const type =
          mode === "waiting"
            ? "waiting"
            : mode === "failed"
              ? "error"
              : mode === "complete"
                ? "completed"
                : "thinking";
        const run = {
          runId: requestId,
          sessionId,
          roomId: sessionId,
          source: "desktop",
          message: `${fixture.prefix} ${mode}`,
          runDepth: "standard",
          configuredMaxIterations: 1,
          observedActionCount: mode === "complete" ? 1 : 0,
          progressMode: "new",
          ...(mode === "complete" ? { lastAction: "SYNTHETIC_E2E" } : {}),
          status,
          localMutations: [],
          pendingApprovals: mode === "waiting" ? 1 : 0,
          startedAt: now,
          updatedAt: now,
          ...(terminal
            ? {
                endedAt: now,
                terminalReason: mode === "failed" ? "error" : "completed",
              }
            : {}),
          ...(mode === "waiting"
            ? { statusDetail: "Synthetic E2E approval is pending." }
            : {}),
        };
        const send = (name: string, data: unknown) => {
          event.sender.send(fixture.event.chatEvent, {
            requestId,
            event: name,
            data,
          });
        };

        if (mode === "complete") {
          send("response.output_text.delta", {
            delta: fixture.text,
            part_id: "assistant-text",
            sequence: 1,
          });
        } else if (mode === "running") {
          send("response.output_text.delta", {
            delta: fixture.text,
            part_id: "assistant-text",
            sequence: 1,
          });
        }
        send("agent.run", { type, sessionId, run });

        if (mode === "complete") {
          send("response.completed", { response: fixture.text });
        } else if (mode === "failed") {
          send("response.failed", {
            message: "Synthetic E2E fixture failure.",
          });
        } else if (mode === "waiting") {
          send("agent.progress", {
            detail: "Synthetic E2E approval is pending.",
          });
          active.set(requestId, {
            mode,
            roomId: sessionId,
            sender: event.sender,
            startedAt: now,
          });
        } else if (mode === "running") {
          active.set(requestId, {
            mode,
            roomId: sessionId,
            sender: event.sender,
            startedAt: now,
          });
        }
      });
      ipcMain.handle(
        fixture.invoke.chatCancel,
        (event, unsafeRequestId: unknown) => {
          if (typeof unsafeRequestId !== "string") {
            throw new Error("Invalid synthetic chat fixture cancellation.");
          }
          const current = active.get(unsafeRequestId);
          if (!current || current.sender !== event.sender) return;
          active.delete(unsafeRequestId);
          const now = new Date().toISOString();
          const run = {
            runId: unsafeRequestId,
            sessionId: current.roomId,
            roomId: current.roomId,
            source: "desktop",
            message: `${fixture.prefix} ${current.mode}`,
            runDepth: "standard",
            configuredMaxIterations: 1,
            observedActionCount: 0,
            progressMode: "new",
            status: "cancelled",
            localMutations: [],
            pendingApprovals: 0,
            startedAt: current.startedAt,
            updatedAt: now,
            endedAt: now,
            terminalReason: "cancelled",
          };
          current.sender.send(fixture.event.chatEvent, {
            requestId: unsafeRequestId,
            event: "agent.run",
            data: { type: "cancelled", sessionId: current.roomId, run },
          });
          current.sender.send(fixture.event.chatEvent, {
            requestId: unsafeRequestId,
            event: "response.cancelled",
            data: { message: "Synthetic E2E fixture cancelled." },
          });
          return { ok: true };
        },
      );
    },
    {
      event: desktopIpcChannels.event,
      invoke: desktopIpcChannels.invoke,
      prefix: FIXTURE_PREFIX,
      text: FIXTURE_TEXT,
    },
  );
}

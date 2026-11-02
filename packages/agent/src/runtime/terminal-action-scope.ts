import { randomBytes, timingSafeEqual } from "node:crypto";
import { requireConversationWorkspace } from "./workspace-scope";

const leases = new Map<string, ReturnType<typeof createLease>>();
let token: string | undefined;
function createLease(signal?: AbortSignal) {
  const scope = requireConversationWorkspace();
  const closed = new AbortController();
  return {
    scope,
    signal: signal ? AbortSignal.any([signal, closed.signal]) : closed.signal,
    closed,
    claimed: false,
  };
}

/** Transport authority for one SDK self-request; never persisted or exposed to clients. */
export function leaseTerminalActionScope(
  command: string,
  signal?: AbortSignal,
) {
  const key = command.trim();
  if (leases.has(key))
    throw new Error("This scoped terminal command is already pending.");
  const lease = createLease(signal);
  lease.signal.throwIfAborted();
  token ??= randomBytes(32).toString("hex");
  process.env.ELIZA_TERMINAL_RUN_TOKEN = token;
  leases.set(key, lease);
  return () => {
    if (leases.get(key) === lease) leases.delete(key);
    lease.closed.abort();
  };
}

/** A process-private SDK token alone grants no workspace: an exact live action must own it. */
export async function claimTerminalActionScope(request: Request) {
  const supplied = request.headers.get("x-eliza-terminal-token");
  if (
    !token ||
    !supplied ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(token) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
  )
    return;
  const body: unknown = await request.clone().json();
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const input = body as Record<string, unknown>;
  if (
    typeof input.command !== "string" ||
    input.captureOutput !== true ||
    input.clientId !== "runtime-terminal-action" ||
    input.terminalToken !== token
  )
    return;
  const lease = leases.get(input.command.trim());
  if (!lease || lease.claimed || lease.signal.aborted) return;
  lease.claimed = true;
  return lease;
}

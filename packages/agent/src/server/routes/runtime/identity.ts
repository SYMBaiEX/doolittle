import { threadId } from "node:worker_threads";
import type { AppContext } from "../../../runtime/bootstrap/index";
import { json } from "../../responses";
import { runtimeInstanceId } from "../../runtime-instance-id";

export function runtimeIdentity(
  context: AppContext,
  workerId?: string,
): Response {
  return json({
    botId: workerId ?? context.runtime.agentId,
    agentId: context.runtime.agentId,
    name: context.config.agentName,
    isDefault: workerId === undefined,
    processId: process.pid,
    threadId,
    runtimeInstanceId: runtimeInstanceId(context.runtime),
  });
}

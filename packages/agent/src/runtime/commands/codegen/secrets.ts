import {
  getEffectiveSecret,
  listEffectiveSecretKeys,
  setEffectiveSecret,
} from "@/runtime/native/service-bridge/autocoder";
import type { AgentExecutionContext } from "../../chat";
import { stringifyCodegenResponse, withAutocoderWorkflow } from "./support";

export async function handleCodegenSecretsCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/secrets list") {
    return stringifyCodegenResponse({
      keys: await listEffectiveSecretKeys(context.runtime),
    });
  }

  if (trimmed.startsWith("/secrets get ")) {
    const key = trimmed.replace("/secrets get ", "").trim();
    if (!key) {
      return "Usage: /secrets get <key>";
    }
    return stringifyCodegenResponse({
      key,
      value: await getEffectiveSecret(context.runtime, key),
    });
  }

  if (trimmed.startsWith("/secrets set ")) {
    const payload = trimmed.replace("/secrets set ", "").trim();
    const [key, value] = payload.split("::").map((part) => part.trim());
    if (!key || !value) {
      return "Usage: /secrets set <key> :: <value>";
    }
    return withAutocoderWorkflow(
      context,
      {
        title: `Set secret ${key}`,
        objective: `Set secret ${key}`,
        kind: "secret.set",
      },
      "system: secret stored",
      async (workflow) => {
        await setEffectiveSecret(context.runtime, key, value);
        const run = context.services.autocoderPipeline.record({
          workflowId: workflow.workflowId,
          kind: "secret.set",
          sessionId: workflow.sessionId,
          taskId: workflow.taskId,
          request: { key, redacted: true },
          result: { key, valueSet: true },
        });
        return stringifyCodegenResponse({
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          key,
          valueSet: true,
        });
      },
    );
  }

  return undefined;
}

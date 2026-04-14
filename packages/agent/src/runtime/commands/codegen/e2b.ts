import {
  createEffectiveSandbox,
  executeEffectiveSandboxCode,
  killEffectiveSandbox,
  listEffectiveSandboxes,
} from "@/runtime/native/service-bridge/autocoder";
import { getNativeExecutionControlPlane } from "@/runtime/native/service-bridge/control-planes";
import type { AgentExecutionContext } from "../../chat";
import { stringifyCodegenResponse } from "./support";

export async function handleCodegenE2bCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/e2b" || trimmed === "/e2b list") {
    return stringifyCodegenResponse({
      control: getNativeExecutionControlPlane(context.runtime).e2b,
      sandboxes: listEffectiveSandboxes(context.runtime),
    });
  }

  if (trimmed.startsWith("/e2b create")) {
    const template = trimmed.replace("/e2b create", "").trim() || undefined;
    return stringifyCodegenResponse({
      sandboxId: await createEffectiveSandbox(context.runtime, {
        template,
      }),
      sandboxes: listEffectiveSandboxes(context.runtime),
    });
  }

  if (trimmed.startsWith("/e2b kill")) {
    const sandboxId = trimmed.replace("/e2b kill", "").trim() || undefined;
    await killEffectiveSandbox(context.runtime, sandboxId);
    return stringifyCodegenResponse({
      killed: sandboxId ?? "active",
      sandboxes: listEffectiveSandboxes(context.runtime),
    });
  }

  if (trimmed.startsWith("/e2b exec ")) {
    const payload = trimmed.replace("/e2b exec ", "").trim();
    const [languagePart, codePart] = payload
      .split("::")
      .map((part) => part.trim());
    if (!languagePart || !codePart) {
      return "Usage: /e2b exec <python|javascript|typescript|bash> :: <code>";
    }
    return stringifyCodegenResponse({
      result: await executeEffectiveSandboxCode(
        context.runtime,
        codePart,
        languagePart,
      ),
    });
  }

  return undefined;
}

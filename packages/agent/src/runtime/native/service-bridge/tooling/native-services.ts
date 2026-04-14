import { getNativeServices } from "../runtime";
import type {
  NativeCodingAgentService,
  NativeMcpService,
  NativeShellService,
  RuntimeLike,
} from "../runtime-contracts";

export function getNativeShell(
  runtime: RuntimeLike,
): NativeShellService | undefined {
  return getNativeServices(runtime).shell as NativeShellService | undefined;
}

export function getNativeMcp(
  runtime: RuntimeLike,
): NativeMcpService | undefined {
  return getNativeServices(runtime).mcp as NativeMcpService | undefined;
}

export function getNativeCodingAgent(
  runtime: RuntimeLike,
): NativeCodingAgentService | undefined {
  return getNativeServices(runtime).codingAgent as
    | NativeCodingAgentService
    | undefined;
}

import { DOOLITTLE_CODING_AGENT_SERVICE } from "@doolittle/contracts";
import { getNativeServices } from "../runtime";
import type {
  NativeCodingAgentService,
  NativeMcpService,
  NativeMemoryStorageService,
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

export function requireNativeMemoryStorage(
  runtime: RuntimeLike,
): NativeMemoryStorageService {
  const service = getNativeServices(runtime)
    .memoryStorage as NativeMemoryStorageService;
  if (!service) {
    throw new Error("Required Eliza service memoryStorage is unavailable.");
  }
  return service;
}

export function requireNativeCodingAgent(
  runtime: RuntimeLike,
): NativeCodingAgentService {
  const service = getNativeCodingAgent(runtime);
  if (!service) {
    throw new Error(
      `Required Eliza service ${DOOLITTLE_CODING_AGENT_SERVICE} is unavailable.`,
    );
  }
  return service;
}

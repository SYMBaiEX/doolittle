import {
  DOOLITTLE_CODING_AGENT_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
} from "@doolittle/contracts";
import { getNativeServices } from "../runtime";
import type {
  NativeCodingAgentService,
  NativeMcpService,
  NativeMemoryStorageService,
  NativeShellService,
  RuntimeLike,
} from "../runtime-contracts";

export function requireNativeShell(runtime: RuntimeLike): NativeShellService {
  const service = getNativeServices(runtime).shell as
    | NativeShellService
    | undefined;
  if (!service) {
    throw new Error(
      `Required Eliza service ${DOOLITTLE_SHELL_SERVICE} is unavailable.`,
    );
  }
  return service;
}

export function requireNativeMcp(runtime: RuntimeLike): NativeMcpService {
  const service = getNativeServices(runtime).mcp as
    | NativeMcpService
    | undefined;
  if (!service) {
    throw new Error(
      `Required Eliza service ${DOOLITTLE_MCP_SERVICE} is unavailable.`,
    );
  }
  return service;
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

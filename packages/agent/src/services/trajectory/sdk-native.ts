import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type IAgentRuntime,
  resolveTrajectoryLogger,
  TrajectoriesService,
} from "@elizaos/core";
import type {
  SdkTrajectoryExportOptions,
  SdkTrajectoryLogger,
} from "@/types/trajectory/sdk";

function isSdkRuntime(runtime: unknown): runtime is IAgentRuntime {
  return (
    !!runtime &&
    typeof runtime === "object" &&
    typeof (runtime as { getService?: unknown }).getService === "function" &&
    typeof (runtime as { getServicesByType?: unknown }).getServicesByType ===
      "function"
  );
}

export function resolveNativeSdkTrajectoryLogger(
  runtime: unknown,
): SdkTrajectoryLogger | undefined {
  if (!isSdkRuntime(runtime)) {
    return undefined;
  }
  try {
    return (
      (TrajectoriesService.resolveFromRuntime(
        runtime,
      ) as SdkTrajectoryLogger | null) ??
      (resolveTrajectoryLogger(runtime) as SdkTrajectoryLogger | null) ??
      undefined
    );
  } catch {
    return undefined;
  }
}

function safeExportFilename(filename: string): string {
  const trimmed = filename.trim() || `trajectories-${Date.now()}.json`;
  return trimmed.replace(/[\\/]/g, "-");
}

export async function writeSdkTrajectoryExport(input: {
  runtime: unknown;
  outputDir: string;
  options: SdkTrajectoryExportOptions;
}): Promise<
  | {
      path: string;
      filename: string;
      mimeType: string;
      bytes: number;
      format: SdkTrajectoryExportOptions["format"];
      includePrompts: boolean;
      source: "elizaos-sdk";
    }
  | undefined
> {
  const logger = resolveNativeSdkTrajectoryLogger(input.runtime);
  if (typeof logger?.exportTrajectories !== "function") {
    return undefined;
  }

  const result = await logger.exportTrajectories(input.options);
  const filename = safeExportFilename(result.filename);
  const data =
    typeof result.data === "string" ? result.data : Buffer.from(result.data);
  const bytes =
    typeof data === "string"
      ? Buffer.byteLength(data, "utf8")
      : data.byteLength;
  mkdirSync(input.outputDir, { recursive: true });
  const path = join(input.outputDir, filename);
  writeFileSync(path, data);

  return {
    path,
    filename,
    mimeType: result.mimeType,
    bytes,
    format: input.options.format,
    includePrompts: input.options.includePrompts === true,
    source: "elizaos-sdk",
  };
}

export function formatSdkTrajectoryExportReceipt(
  result: Awaited<ReturnType<typeof writeSdkTrajectoryExport>>,
): string | undefined {
  if (!result) {
    return undefined;
  }
  return [
    `ElizaOS SDK trajectory export: ${result.path}`,
    `format=${result.format}`,
    `includePrompts=${result.includePrompts}`,
    `bytes=${result.bytes}`,
  ].join("\n");
}

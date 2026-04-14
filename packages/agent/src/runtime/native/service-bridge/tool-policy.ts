import { getEffectiveServiceResolution } from "./control-planes";
import { getNativeServices, type RuntimeLike } from "./runtime";

export interface EffectiveTurnCapabilityPolicy {
  profile: "minimal" | "coding" | "messaging" | "full";
  preferredTools: string[];
  deniedTools: Array<{ name: string; reason: string }>;
}

export function getEffectiveTurnCapabilityPolicy(
  runtime: RuntimeLike,
  profile: "minimal" | "coding" | "messaging" | "full",
): EffectiveTurnCapabilityPolicy {
  const nativeToolPolicy = getNativeServices(runtime).toolPolicy as
    | {
        getAllowedTools?(
          context: {
            profile?: "minimal" | "coding" | "messaging" | "full";
          },
          availableTools: string[],
        ): string[];
        getDeniedTools?(
          context: {
            profile?: "minimal" | "coding" | "messaging" | "full";
          },
          availableTools: string[],
        ): Array<{ name: string; reason: string }>;
      }
    | undefined;
  const availableTools = getEffectiveServiceResolution(runtime)
    .filter((entry) => entry.available)
    .map((entry) => entry.capability);
  const fallbackPreferredTools =
    profile === "minimal"
      ? []
      : profile === "coding"
        ? availableTools.filter((tool) =>
            ["codingAgent", "agentOrchestrator", "mcp"].includes(tool),
          )
        : profile === "messaging"
          ? availableTools.filter((tool) =>
              ["browser", "knowledge", "mcp"].includes(tool),
            )
          : availableTools;
  const nativePreferredTools = nativeToolPolicy?.getAllowedTools?.(
    { profile },
    availableTools,
  );

  const preferredTools =
    nativePreferredTools &&
    (nativePreferredTools.length > 0 || profile === "minimal")
      ? nativePreferredTools
      : fallbackPreferredTools;

  const deniedTools =
    nativeToolPolicy?.getDeniedTools?.({ profile }, availableTools) ??
    (profile === "minimal"
      ? availableTools.map((tool) => ({
          name: tool,
          reason:
            "avoid unless the user explicitly asks for tools or local execution",
        }))
      : []);

  return {
    profile,
    preferredTools,
    deniedTools,
  };
}

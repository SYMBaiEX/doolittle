import { describeAutonomousAlignment } from "../../autonomous-stack";
import type { AutonomousControlPlaneSummary } from "../autonomous";
import {
  buildCodingAgentSection,
  buildExecutionSection,
  buildFormsSection,
  buildMediaSection,
  buildOrchestratorSection,
  buildPluginManagerSection,
  buildResearchSection,
  buildSkillsSection,
  buildTrajectoriesSection,
  collectServiceSources,
  resolveSkillsSummary,
} from "./sections";
import type { AutonomousSummaryInput } from "./types";

export function buildAutonomousControlPlaneSummary(
  input: AutonomousSummaryInput,
): AutonomousControlPlaneSummary {
  const resolvedSkillsSummary = resolveSkillsSummary(input.skillsSummary);
  const serviceSources = collectServiceSources(input.native);

  return {
    alignment: describeAutonomousAlignment(input.config),
    skills: buildSkillsSection(input, resolvedSkillsSummary),
    orchestrator: buildOrchestratorSection(input),
    codingAgent: buildCodingAgentSection(input),
    trajectories: buildTrajectoriesSection(input),
    pluginManager: buildPluginManagerSection(input),
    media: buildMediaSection(input),
    research: buildResearchSection(input),
    forms: buildFormsSection(input),
    execution: buildExecutionSection(input),
    totals: {
      nativeServices: serviceSources.filter(Boolean).length,
      productFallbacks: serviceSources.filter((entry) => !entry).length,
    },
  };
}

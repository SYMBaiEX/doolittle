import {
  getEffectiveSkills,
  getEffectiveSkillsSummary,
} from "@/runtime/native/service-bridge/autonomous";
import { getEffectiveGeneratedSkills } from "@/runtime/native/service-bridge/ownership";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import {
  getEffectiveSkillHubFamilies,
  getEffectiveSkillHubFamily,
  getEffectiveSkillHubInstalled,
  getEffectiveSkillHubInstalledManifest,
  getEffectiveSkillHubSummary,
  getEffectiveSkillHubWorkspace,
} from "@/runtime/native/service-bridge/skill-hub";

import type { SkillCommandHandler } from "./types";

export const handleSkillInventoryCommand: SkillCommandHandler = async (
  trimmed,
  context,
) => {
  if (trimmed === "/skills" || trimmed === "/skills list") {
    const skills = getEffectiveSkills(
      context.runtime,
      context.services,
    ) as Array<{
      slug: string;
      description?: string;
      source?: string;
      commandName?: string;
    }>;
    const summary = getEffectiveSkillsSummary(
      context.runtime,
      context.services,
    ) as {
      total: number;
      workspace?: number;
      generated?: number;
      bundled?: number;
      managed?: number;
      project?: number;
      invocable?: number;
    };
    const workspace = getEffectiveSkillHubWorkspace(context.services) as Array<{
      slug: string;
      title: string;
      description: string;
      source: string;
      manifestPath: string;
    }>;
    const visibleSkills = skills.slice(0, 50);
    return [
      `available=${summary.total} workspace=${summary.workspace ?? workspace.length} generated=${summary.generated ?? getEffectiveGeneratedSkills(context.runtime, context.services).length} bundled=${summary.bundled ?? 0} managed=${summary.managed ?? 0} project=${summary.project ?? 0} installed=${getEffectiveSkillHubInstalled(context.services).length} invocable=${summary.invocable ?? 0}`,
      "",
      visibleSkills.length
        ? visibleSkills
            .map(
              (skill) =>
                `- ${skill.slug} [${skill.source ?? "workspace"}${skill.commandName ? ` cmd=${skill.commandName}` : ""}]: ${skill.description ?? "No description available."}`,
            )
            .join("\n")
        : "No skills found.",
      skills.length > visibleSkills.length
        ? `\n… ${skills.length - visibleSkills.length} more skill(s). Use /skills summary or /skills show <slug> for deeper detail.`
        : "",
    ].join("\n");
  }

  if (trimmed === "/skills summary") {
    return JSON.stringify(
      {
        workspace: getEffectiveSkillsSummary(context.runtime, context.services),
        hub: getEffectiveSkillHubSummary(context.services),
        installed: getEffectiveSkillHubInstalled(context.services),
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills hub") {
    return JSON.stringify(
      getEffectiveSkillHubSummary(context.services),
      null,
      2,
    );
  }

  if (trimmed === "/skills hub distribution") {
    return JSON.stringify(
      getEffectiveSkillHubSummary(context.services).distribution,
      null,
      2,
    );
  }

  if (trimmed === "/skills families" || trimmed === "/skills hub families") {
    return JSON.stringify(
      getEffectiveSkillHubFamilies(context.services, 50),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills family ")) {
    const slug = trimmed.replace("/skills family ", "").trim();
    if (!slug) {
      return "Usage: /skills family <slug>";
    }
    return JSON.stringify(
      getEffectiveSkillHubFamily(context.services, slug) ?? {
        error: `Skill family not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills installed") {
    return JSON.stringify(
      getEffectiveSkillHubInstalled(context.services),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills installed show ")) {
    const slug = trimmed.replace("/skills installed show ", "").trim();
    if (!slug) {
      return "Usage: /skills installed show <slug>";
    }
    return JSON.stringify(
      getEffectiveSkillHubInstalledManifest(context.services, slug) ?? {
        error: `Installed skill manifest not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills show ")) {
    const slug = trimmed.replace("/skills show ", "").trim();
    const skill =
      (getNativeServices(context.runtime).agentSkills?.get(slug) as
        | { content?: string }
        | undefined) ?? context.services.skills.get(slug);
    return skill ? skill.content : `Skill not found: ${slug}`;
  }

  if (trimmed === "/skills channels") {
    return JSON.stringify(
      {
        channels: context.services.ecosystem.distributionChannels(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills optional" || trimmed === "/skills optional packs") {
    return JSON.stringify(
      {
        optionalSkillPacks: context.services.ecosystem.optionalSkillPacks(),
      },
      null,
      2,
    );
  }

  return undefined;
};

import {
  exportEffectiveSkillHubManifest,
  getEffectiveGeneratedSkills,
  getEffectiveSkillHubCatalog,
  getEffectiveSkillHubFamilies,
  getEffectiveSkillHubFamily,
  getEffectiveSkillHubGenerated,
  getEffectiveSkillHubInstalled,
  getEffectiveSkillHubInstalledManifest,
  getEffectiveSkillHubSummary,
  getEffectiveSkillHubWorkspace,
  getEffectiveSkills,
  getEffectiveSkillsSummary,
  getNativeServices,
  importEffectiveSkillHubManifest,
  installEffectiveSkillHubManifest,
  searchEffectiveSkillHubCatalog,
  syncEffectiveSkillHub,
} from "@/runtime/native/service-bridge/index";
import type { AgentExecutionContext } from "../../chat";

export async function handleSkillCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
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
      `available=${summary.total} workspace=${summary.workspace ?? workspace.length} generated=${summary.generated ?? getEffectiveSkillHubGenerated(context.services).length} bundled=${summary.bundled ?? 0} managed=${summary.managed ?? 0} project=${summary.project ?? 0} installed=${getEffectiveSkillHubInstalled(context.services).length} invocable=${summary.invocable ?? 0}`,
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

  if (trimmed === "/skills catalog") {
    return JSON.stringify(
      await getEffectiveSkillHubCatalog(context.services, false, 50),
      null,
      2,
    );
  }

  if (trimmed === "/skills catalog refresh") {
    return JSON.stringify(
      await getEffectiveSkillHubCatalog(context.services, true, 50),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills catalog search ")) {
    const query = trimmed.replace("/skills catalog search ", "").trim();
    if (!query) {
      return "Usage: /skills catalog search <query>";
    }
    return JSON.stringify(
      await searchEffectiveSkillHubCatalog(context.services, query),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills catalog show ")) {
    const slug = trimmed.replace("/skills catalog show ", "").trim();
    if (!slug) {
      return "Usage: /skills catalog show <slug>";
    }
    return JSON.stringify(
      (await context.services.skillsHub.catalogEntry(slug)) ?? {
        error: `Catalog skill not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills sync" || trimmed === "/skills sync refresh") {
    return JSON.stringify(
      await syncEffectiveSkillHub(context.services, true),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills manifest ")) {
    const slug = trimmed.replace("/skills manifest ", "").trim();
    if (!slug) {
      return "Usage: /skills manifest <slug>";
    }
    return JSON.stringify(
      context.services.skillsHub.manifest(slug) ?? {
        error: `Skill manifest not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills export ")) {
    const raw = trimmed.replace("/skills export ", "").trim();
    if (!raw) {
      return "Usage: /skills export <slug|all>";
    }
    if (raw === "all") {
      return JSON.stringify(
        await context.services.skillsHub.exportBundle("skills-hub"),
        null,
        2,
      );
    }
    return JSON.stringify(
      exportEffectiveSkillHubManifest(context.services, raw),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills import ")) {
    const sourcePath = trimmed.replace("/skills import ", "").trim();
    if (!sourcePath) {
      return "Usage: /skills import <manifest-path>";
    }
    return JSON.stringify(
      importEffectiveSkillHubManifest(context.services, sourcePath),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills install ")) {
    const slug = trimmed.replace("/skills install ", "").trim();
    if (!slug) {
      return "Usage: /skills install <catalog-slug>";
    }
    return JSON.stringify(
      await installEffectiveSkillHubManifest(context.services, slug),
      null,
      2,
    );
  }

  if (trimmed === "/skills generated" || trimmed === "/skills generated list") {
    const generated = getEffectiveGeneratedSkills(
      context.runtime,
      context.services,
    ) as Array<{
      slug?: string;
      updatedAt?: string;
      noteCount?: number;
      signalCount?: number;
      title?: string;
      path?: string;
    }>;
    return generated.length
      ? generated
          .map(
            (skill) =>
              `- ${skill.slug ?? "unknown"} [${skill.updatedAt ?? "n/a"}] notes=${skill.noteCount ?? 0} signals=${skill.signalCount ?? 0}\n  ${skill.title ?? "Untitled"}\n  ${skill.path ?? "n/a"}`,
          )
          .join("\n\n")
      : "No generated skills recorded.";
  }

  if (trimmed.startsWith("/skills generated show ")) {
    const slug = trimmed.replace("/skills generated show ", "").trim();
    if (!slug) {
      return "Usage: /skills generated show <slug>";
    }
    return JSON.stringify(
      context.services.skillSynthesis.getGeneratedSkill(slug) ?? {
        error: `Generated skill not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills generated describe ")) {
    const slug = trimmed.replace("/skills generated describe ", "").trim();
    if (!slug) {
      return "Usage: /skills generated describe <slug>";
    }
    return context.services.skillSynthesis.describeGeneratedSkill(slug);
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

  if (trimmed.startsWith("/skills synthesize ")) {
    const id = trimmed.replace("/skills synthesize ", "").trim();
    const task = context.services.delegation
      .list()
      .find((entry) => entry.id === id);
    if (!task) {
      return `Delegation task not found: ${id}`;
    }
    return context.services.skillSynthesis.synthesizeFromTask(task);
  }

  return undefined;
}

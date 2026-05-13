import { getEffectiveGeneratedSkills } from "@/runtime/native/service-bridge/ownership";

import type { SkillCommandHandler } from "./types";

export const handleGeneratedSkillCommand: SkillCommandHandler = async (
  trimmed,
  context,
  options,
) => {
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

  if (
    trimmed === "/skills synthesize" ||
    trimmed === "/skills synthesize latest"
  ) {
    const sessionId = options?.sessionId;
    if (!sessionId) {
      return "No active session is available for conversation skill synthesis.";
    }
    const messages = context.services.sessions.messagesBySession(
      sessionId,
      200,
    );
    const result = context.services.skillSynthesis.maybeAutoSynthesize(
      messages,
      sessionId,
    );
    if (!result) {
      return "No reusable workflow was detected in the latest session yet.";
    }
    context.services.trajectories.recordEvent({
      category: "skill",
      event: "skill.synthesized",
      sessionId,
      source: "cli",
      text: `[skill:synthesized] ${result.candidate.title} -> ${result.path}`,
      metadata: {
        title: result.candidate.title,
        slug: result.candidate.slug,
        path: result.path,
      },
    });
    return [
      `Generated skill: ${result.candidate.title}`,
      `slug: ${result.candidate.slug}`,
      `path: ${result.path}`,
    ].join("\n");
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
};

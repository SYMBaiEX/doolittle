import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { AppServices } from "@/services";

export function createSkillsAction(services: AppServices): Action {
  return {
    name: "ELIZA_AGENT_SKILLS",
    similes: ["SKILLS_LIST", "SKILLS_SHOW", "LOAD_SKILL", "SKILLS_SUMMARY"],
    description:
      "Lists or shows available skills via `/skills list` or `/skills show <slug>`.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      return Boolean(text?.trim().startsWith("/skills"));
    },
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      _options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      const trimmed = text?.trim() ?? "";
      let response = "";

      if (
        trimmed === "/skills" ||
        trimmed === "/skills list" ||
        trimmed === "/skills summary"
      ) {
        const skills = services.skills.list();
        const summary = services.skills.summary();
        response = [
          `Skills workspace: total=${summary.total} curated=${summary.curated} generated=${summary.generated}`,
          `Families: ${summary.roots.map((entry) => `${entry.name}(${entry.count})`).join(", ") || "none"}`,
          skills.length
            ? skills
                .map((skill) => `- ${skill.slug}: ${skill.description}`)
                .join("\n")
            : "No skills found.",
        ].join("\n");
      } else if (trimmed.startsWith("/skills show ")) {
        const slug = trimmed.replace("/skills show ", "").trim();
        const skill = services.skills.get(slug);
        response = skill
          ? `${skill.title}\n\n${skill.content}`
          : `Skill not found: ${slug}`;
      } else {
        response =
          "Usage: /skills list, /skills summary, or /skills show <slug>";
      }

      await callback?.({ text: response, source: "skills-action" });
      return { success: true, text: response };
    },
    examples: [
      [
        {
          name: "{{userName}}",
          content: { text: "/skills list" },
        },
        {
          name: "{{agentName}}",
          content: {
            text: "- productivity/google-workspace: Google Workspace helpers",
            actions: ["ELIZA_AGENT_SKILLS"],
          },
        },
      ],
    ],
  };
}

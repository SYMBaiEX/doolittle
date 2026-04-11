export const DEFAULT_TEMPLATES = {
  project_scaffold: {
    id: "project_scaffold",
    name: "Project Scaffold",
    description: "Collects the project name, scope, APIs, and outcomes.",
    fields: [
      "projectName",
      "description",
      "apis",
      "requirements",
      "deliverables",
    ],
  },
  research_brief: {
    id: "research_brief",
    name: "Research Brief",
    description: "Captures a research request for benchmark and analysis work.",
    fields: ["title", "objective", "constraints", "sources"],
  },
  release_readiness: {
    id: "release_readiness",
    name: "Release Readiness",
    description: "Tracks rollout, QA, and launch gating decisions.",
    fields: ["releaseName", "checks", "risks", "owner"],
  },
} as const;

export type FormsTemplateCatalog = typeof DEFAULT_TEMPLATES;

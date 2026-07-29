import type { CommandCatalogEntry } from "../types";

export const MediaCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/media analyze <path>",
    category: "media",
    description: "Run model-assisted media analysis.",
  },
  {
    command: "/media transcript <path>",
    category: "media",
    description: "Generate or read a transcript for an audio file.",
  },
  {
    command: "/media generate <prompt>",
    category: "media",
    description: "Create an image concept artifact from a prompt.",
  },
  {
    command: "/pdf extract <path>",
    category: "media",
    description: "Extract readable text from a local PDF document.",
  },
];

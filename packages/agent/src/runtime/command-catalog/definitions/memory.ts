import type { CommandCatalogEntry } from "../types";

export const MemoryCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/modeling profiles",
    category: "memory",
    description: "List workspace-native user and assistant modeling profiles.",
  },
  {
    command: "/memory list memory",
    category: "memory",
    description: "Show long-term memory entries.",
  },
  {
    command: "/memory summary",
    category: "memory",
    description: "Show native memory summary data.",
  },
  {
    command: "/user card",
    category: "memory",
    description: "Show the current user memory card.",
  },
  {
    command: "/user beliefs",
    category: "memory",
    description: "Show extracted beliefs for the active user.",
  },
  {
    command: "/user relationship",
    category: "memory",
    description: "Show the current relationship summary for the active user.",
  },
  {
    command: "/user engagement",
    category: "memory",
    description: "Show the current engagement summary for the active user.",
  },
  {
    command: "/user search <query>",
    category: "memory",
    description: "Search the user profile index for matching signals.",
  },
  {
    command: "/profiles summary",
    category: "memory",
    description: "Show native rolodex and profile workspace summary data.",
  },
  {
    command: "/profiles users summary",
    category: "memory",
    description: "Show the Honcho-style user modeling workspace summary.",
  },
  {
    command: "/profiles users search <query>",
    category: "memory",
    description: "Search all user profiles by profile signal.",
  },
  {
    command: "/agent profile",
    category: "memory",
    description: "Show the Doolittle identity profile.",
  },
  {
    command: "/personality summary",
    category: "memory",
    description: "Show native personality summary data.",
  },
  {
    command: "/experience summary",
    category: "memory",
    description: "Show native session and memory experience summary data.",
  },
  {
    command: "/experience",
    category: "memory",
    description: "Show native session and memory experience summary data.",
  },
];

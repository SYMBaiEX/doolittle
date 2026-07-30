import {
  getEffectiveAgentProfileCard,
  getEffectiveUserBeliefs,
  getEffectiveUserEngagement,
  getEffectiveUserProfileCard,
  getEffectiveUserProfileSearch,
  getEffectiveUserProfileSummary,
  getEffectiveUserRelationship,
  listEffectiveUserProfiles,
} from "@/runtime/native/service-bridge/ownership";
import type { AppServices } from "@/services";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import { stringifyCommandResult } from "./shared";

export function handleUserProfileReadCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): string | undefined {
  if (trimmed === "/user" || trimmed === "/user profile") {
    return stringifyCommandResult(
      getEffectiveUserProfileCard(context.runtime, input.userId),
    );
  }

  if (trimmed === "/user beliefs") {
    return JSON.stringify(
      getEffectiveUserBeliefs(context.runtime, input.userId),
      null,
      2,
    );
  }

  if (trimmed === "/user relationship") {
    return JSON.stringify(
      getEffectiveUserRelationship(context.runtime, input.userId),
      null,
      2,
    );
  }

  if (trimmed === "/user engagement") {
    return JSON.stringify(
      getEffectiveUserEngagement(context.runtime, input.userId),
      null,
      2,
    );
  }

  if (
    trimmed === "/profiles summary" ||
    trimmed === "/profiles users summary"
  ) {
    return JSON.stringify(
      getEffectiveUserProfileSummary(context.runtime),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user search ")) {
    const query = trimmed.replace("/user search ", "").trim();
    if (!query) {
      return "Usage: /user search <query>";
    }
    return JSON.stringify(
      getEffectiveUserProfileSearch(context.runtime, query),
      null,
      2,
    );
  }

  if (trimmed === "/user card" || trimmed === "/profiles card") {
    return stringifyCommandResult(
      getEffectiveUserProfileCard(context.runtime, input.userId),
    );
  }

  if (trimmed === "/agent profile") {
    return stringifyCommandResult(
      getEffectiveAgentProfileCard(context.runtime),
    );
  }

  if (trimmed === "/user list") {
    const profiles = (
      listEffectiveUserProfiles(context.runtime) as ReturnType<
        AppServices["userProfiles"]["list"]
      >
    ).slice(0, 20);
    return profiles.length
      ? profiles
          .map(
            (profile) =>
              `- ${profile.displayName ?? profile.userId}: prefs=${profile.preferences.length} facts=${profile.facts.length} notes=${profile.notes.length}`,
          )
          .join("\n")
      : "No user profiles recorded.";
  }

  if (trimmed.startsWith("/profiles users search ")) {
    const query = trimmed.replace("/profiles users search ", "").trim();
    if (!query) {
      return "Usage: /profiles users search <query>";
    }
    return JSON.stringify(
      getEffectiveUserProfileSearch(context.runtime, query),
      null,
      2,
    );
  }

  return undefined;
}

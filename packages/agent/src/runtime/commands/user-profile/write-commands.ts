import {
  observeEffectiveAgentProfile,
  recallEffectiveUserProfile,
  rememberEffectiveUserProfile,
} from "@/runtime/native/service-bridge/ownership";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import {
  isUserMemoryKind,
  parseAgentSeed,
  parseUserModelingSettings,
  USER_REMEMBER_USAGE,
} from "./parsers";

export function handleUserProfileWriteCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): string | undefined {
  if (trimmed.startsWith("/user recall ")) {
    const query = trimmed.replace("/user recall ", "").trim();
    if (!query) {
      return "Usage: /user recall <query>";
    }
    return JSON.stringify(
      recallEffectiveUserProfile(
        context.runtime,
        context.services,
        input.userId,
        query,
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user context ")) {
    const query = trimmed.replace("/user context ", "").trim();
    if (!query) {
      return "Usage: /user context <question>";
    }
    return JSON.stringify(
      context.services.userProfiles.context(input.userId, query),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user conclude ")) {
    const payload = trimmed.replace("/user conclude ", "");
    const [queryRaw, ...conclusionParts] = payload.split("::");
    const query = queryRaw?.trim();
    const conclusion = conclusionParts.join("::").trim();
    if (!query || !conclusion) {
      return "Usage: /user conclude <question> :: <conclusion>";
    }
    return JSON.stringify(
      {
        context: context.services.userProfiles.context(input.userId, query),
        conclusion: context.services.userProfiles.conclude(
          input.userId,
          query,
          conclusion,
          input.source,
        ),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user note ")) {
    const note = trimmed.replace("/user note ", "").trim();
    if (!note) {
      return "Usage: /user note <text>";
    }
    return JSON.stringify(
      rememberEffectiveUserProfile(
        context.runtime,
        context.services,
        input.userId,
        "note",
        note,
        input.source,
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user mode ")) {
    const mode = trimmed.replace("/user mode ", "").trim();
    if (mode !== "local" && mode !== "hybrid") {
      return "Usage: /user mode <local|hybrid>";
    }
    return JSON.stringify(
      context.services.userProfiles.setMode(input.userId, mode),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user modeling ")) {
    const settings = parseUserModelingSettings(
      trimmed.replace("/user modeling ", ""),
    );
    if (
      !settings.userMemoryMode &&
      !settings.assistantMemoryMode &&
      !settings.dialecticMode
    ) {
      return "Usage: /user modeling user:<local|hybrid> | assistant:<local|hybrid> | dialectic:<off|assist|conclude>";
    }
    return JSON.stringify(
      context.services.userProfiles.configureModeling(input.userId, settings),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user remember ")) {
    const payload = trimmed.replace("/user remember ", "");
    const [kindRaw, ...valueParts] = payload.split("::");
    const kind = kindRaw?.trim();
    const value = valueParts.join("::").trim();
    if (!kind || !value) {
      return USER_REMEMBER_USAGE;
    }
    if (!isUserMemoryKind(kind)) {
      return USER_REMEMBER_USAGE;
    }
    return JSON.stringify(
      rememberEffectiveUserProfile(
        context.runtime,
        context.services,
        input.userId,
        kind,
        value,
        input.source,
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/agent observe ")) {
    const note = trimmed.replace("/agent observe ", "").trim();
    if (!note) {
      return "Usage: /agent observe <text>";
    }
    return JSON.stringify(
      observeEffectiveAgentProfile(
        context.runtime,
        context.services,
        note,
        input.source,
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/agent seed ")) {
    const raw = trimmed.replace("/agent seed ", "").trim();
    if (!raw) {
      return "Usage: /agent seed name:Doolittle | goals:a,b | strengths:x,y | style:m,n | notes:p,q";
    }
    return JSON.stringify(
      context.services.userProfiles.seedAgent(parseAgentSeed(raw)),
      null,
      2,
    );
  }

  return undefined;
}

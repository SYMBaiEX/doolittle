import { expect, it } from "vitest";
import { readWorkerBotProfile } from "../../packages/agent/src/runtime/bootstrap/bot-profile";

it("keeps worker permissions isolated and revalidates a changed launch payload", () => {
  const profile = {
    id: "fixture-bot",
    name: "Fixture",
    agentId: "c9b92352-f7bb-4a39-b85d-dad2e6a7ca00",
    persona: "Inspect the project.",
    workspacePath: "/test/workspace",
    isDefault: false,
    model: { provider: "offline", model: "offline" },
    permissions: {
      connectionIds: [],
      toolIds: [],
      workspacePaths: ["/test/workspace"],
      allowMutation: false,
      allowDelegation: false,
    },
  };
  const env = {
    DOOLITTLE_BOT_RUNTIME: "worker",
    DOOLITTLE_BOT_PROFILE: JSON.stringify(profile),
  };
  const first = readWorkerBotProfile(env);
  if (!first) throw new Error("Expected a worker profile.");
  first.permissions.allowMutation = true;
  first.permissions.workspacePaths.push("/test/other");
  expect(readWorkerBotProfile(env)?.permissions).toEqual(profile.permissions);

  env.DOOLITTLE_BOT_PROFILE = "{}";
  expect(() => readWorkerBotProfile(env)).toThrow(
    "launch profile is incomplete",
  );
  env.DOOLITTLE_BOT_PROFILE = JSON.stringify({ ...profile, name: "Updated" });
  expect(readWorkerBotProfile(env)?.name).toBe("Updated");
  env.DOOLITTLE_BOT_RUNTIME = "lead";
  expect(readWorkerBotProfile(env)).toBeNull();
});

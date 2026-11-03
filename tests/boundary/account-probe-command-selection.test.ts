import { expect, it } from "vitest";
import { resolveLinkedProviderName } from "../../packages/agent/src/runtime/linked-provider-accounts/provider-name";
import { getProviderReadinessMessage } from "../../packages/agent/src/runtime/linked-provider-accounts/readiness";

it("does not accept removed provider aliases for account activation", () => {
  for (const alias of ["devin", "swe", "windsurf"]) {
    expect(resolveLinkedProviderName(alias)).toBeUndefined();
  }
  expect(resolveLinkedProviderName("codex")).toBe("codex");
});

it("fails closed with a recovery message for a saved removed route", async () => {
  const context = {
    runtime: {},
    config: {},
  } as unknown as import("../../packages/agent/src/runtime/chat").AgentExecutionContext;
  await expect(
    getProviderReadinessMessage(context, "devin"),
  ).resolves.toContain("Choose another provider");
});

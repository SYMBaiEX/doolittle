import { expect, it } from "vitest";
import { resolveLinkedProviderName } from "../../packages/agent/src/runtime/linked-provider-accounts/provider-name";

it("does not accept removed provider aliases for account activation", () => {
  for (const alias of ["devin", "swe", "windsurf"]) {
    expect(resolveLinkedProviderName(alias)).toBeUndefined();
  }
  expect(resolveLinkedProviderName("codex")).toBe("codex");
});

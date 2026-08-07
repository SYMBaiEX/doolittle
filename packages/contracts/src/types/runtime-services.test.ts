import { describe, expect, it } from "vitest";
import {
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_CODE_GENERATION_SERVICE,
  DOOLITTLE_CODING_AGENT_SERVICE,
  DOOLITTLE_EXPERIENCE_SERVICE,
  DOOLITTLE_FORMS_SERVICE,
  DOOLITTLE_GITHUB_PLANNING_SERVICE,
  DOOLITTLE_LOCAL_SANDBOX_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_PERSONALITY_SERVICE,
  DOOLITTLE_ROLODEX_SERVICE,
  DOOLITTLE_SECRETS_VAULT_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
} from "./runtime-services";

describe("Doolittle runtime service identifiers", () => {
  it("does not claim service identifiers owned by official Eliza plugins", () => {
    expect([
      DOOLITTLE_BROWSER_SERVICE,
      DOOLITTLE_CODE_GENERATION_SERVICE,
      DOOLITTLE_CODING_AGENT_SERVICE,
      DOOLITTLE_EXPERIENCE_SERVICE,
      DOOLITTLE_FORMS_SERVICE,
      DOOLITTLE_GITHUB_PLANNING_SERVICE,
      DOOLITTLE_LOCAL_SANDBOX_SERVICE,
      DOOLITTLE_MCP_SERVICE,
      DOOLITTLE_PERSONALITY_SERVICE,
      DOOLITTLE_ROLODEX_SERVICE,
      DOOLITTLE_SECRETS_VAULT_SERVICE,
      DOOLITTLE_SHELL_SERVICE,
    ]).not.toEqual(
      expect.arrayContaining([
        "browser",
        "coding_agent",
        "e2b",
        "experience",
        "forms",
        "mcp",
        "personality",
        "rolodex",
        "shell",
      ]),
    );
  });

  it("keeps product projections explicitly namespaced", () => {
    expect(DOOLITTLE_BROWSER_SERVICE).toBe("doolittle_browser");
    expect(DOOLITTLE_CODE_GENERATION_SERVICE).toBe("doolittle_code_generation");
    expect(DOOLITTLE_CODING_AGENT_SERVICE).toBe("doolittle_coding_agent");
    expect(DOOLITTLE_EXPERIENCE_SERVICE).toBe("doolittle_experience");
    expect(DOOLITTLE_FORMS_SERVICE).toBe("doolittle_forms");
    expect(DOOLITTLE_GITHUB_PLANNING_SERVICE).toBe("doolittle_github_planning");
    expect(DOOLITTLE_LOCAL_SANDBOX_SERVICE).toBe("doolittle_local_sandbox");
    expect(DOOLITTLE_MCP_SERVICE).toBe("doolittle_mcp");
    expect(DOOLITTLE_PERSONALITY_SERVICE).toBe("doolittle_personality");
    expect(DOOLITTLE_ROLODEX_SERVICE).toBe("doolittle_rolodex");
    expect(DOOLITTLE_SECRETS_VAULT_SERVICE).toBe("doolittle_secrets_vault");
    expect(DOOLITTLE_SHELL_SERVICE).toBe("doolittle_shell");
  });
});

import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../chat";
import { handleIdentityStatusCommand } from "./identity-status-router";

function createContext(): AgentExecutionContext {
  return {
    runtime: {},
    services: {
      personalities: {
        getActive: () => ({
          id: "focus",
          name: "Focus",
          description: "Stays on task.",
          systemAddendum: "Prefer decisive execution.",
        }),
        list: () => [
          { id: "focus", description: "Stays on task." },
          { id: "coach", description: "Teaches patiently." },
        ],
        setActive: (id: string) => ({
          id,
          name: id === "coach" ? "Coach" : "Focus",
        }),
        summary: () => ({
          total: 2,
          names: ["focus", "coach"],
        }),
      },
      sessions: {
        summary: () => ({
          total: 3,
        }),
      },
      memory: {
        summary: (target: "memory" | "user") => ({
          target,
          entries: target === "memory" ? 4 : 2,
        }),
      },
    },
  } as unknown as AgentExecutionContext;
}

describe("identity status command router", () => {
  it("renders active personality status and summaries", async () => {
    const context = createContext();

    const status = await handleIdentityStatusCommand("/personality", context, {
      formatPersonalitySummary: () => "2 personalities available",
      buildSystemFactsContext: () => "unused",
    });
    const summary = await handleIdentityStatusCommand(
      "/personality summary",
      context,
      {
        formatPersonalitySummary: () => "unused",
        buildSystemFactsContext: () => "unused",
      },
    );

    expect(status).toContain("Focus (focus)");
    expect(status).toContain("Summary: 2 personalities available");
    expect(summary).toContain('"total": 2');
  });

  it("lists and switches personalities", async () => {
    const context = createContext();

    const listed = await handleIdentityStatusCommand(
      "/personality list",
      context,
      {
        formatPersonalitySummary: () => "unused",
        buildSystemFactsContext: () => "unused",
      },
    );
    const switched = await handleIdentityStatusCommand(
      "/personality set coach",
      context,
      {
        formatPersonalitySummary: () => "unused",
        buildSystemFactsContext: () => "unused",
      },
    );

    expect(listed).toContain("- focus: Stays on task.");
    expect(listed).toContain("- coach: Teaches patiently.");
    expect(switched).toBe("Active personality set to Coach.");
  });

  it("renders system facts and experience summaries", async () => {
    const context = createContext();

    const system = await handleIdentityStatusCommand("/system facts", context, {
      formatPersonalitySummary: () => "unused",
      buildSystemFactsContext: () => "Live machine facts:\n- os=test",
    });
    const experience = await handleIdentityStatusCommand(
      "/experience summary",
      context,
      {
        formatPersonalitySummary: () => "unused",
        buildSystemFactsContext: () => "unused",
      },
    );

    expect(system).toBe("Live machine facts:\n- os=test");
    expect(experience).toContain('"total": 3');
    expect(experience).toContain('"entries": 4');
  });

  it("returns undefined for unrelated commands", async () => {
    const response = await handleIdentityStatusCommand(
      "/not-identity",
      createContext(),
      {
        formatPersonalitySummary: () => "unused",
        buildSystemFactsContext: () => "unused",
      },
    );

    expect(response).toBeUndefined();
  });
});

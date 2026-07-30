import { describe, expect, it } from "vitest";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime";
import {
  countQueueActiveWorkers,
  countQueuePending,
  getAutonomousControlPlane,
} from "./index";

describe("queue count helpers", () => {
  it("counts pending and active workers from numeric fields", () => {
    expect(countQueuePending({ pending: 3, activeWorkers: 1 })).toBe(3);
    expect(countQueueActiveWorkers({ activeWorkers: 4 })).toBe(4);
  });

  it("counts pending and active entries from status lists", () => {
    const queue = {
      items: [
        { status: "pending" },
        { status: "queued" },
        { status: "running" },
        { status: "active" },
        { status: "completed" },
      ],
    };

    expect(countQueuePending(queue)).toBe(2);
    expect(countQueueActiveWorkers(queue)).toBe(2);
  });
});

describe("autonomous control plane", () => {
  it("builds queue metrics from the official task read projection", () => {
    const runtime = {
      getService(name: string) {
        if (name === "ORCHESTRATOR_TASK_SERVICE") {
          return {};
        }
        if (name === "AGENT_SKILLS_SERVICE") {
          return {
            getLoadedSkills: () => [],
          };
        }
        if (name === "coding_agent") {
          return {
            read: () => "",
            write: () => undefined,
            search: () => [],
            repoStatus: async () => ({}),
            repoDiff: async () => ({}),
            repoLog: async () => [],
            run: async () => ({}),
            tasks: () => [],
          };
        }
        if (name === "trajectories") {
          return {
            isEnabled: () => true,
            listTrajectories: () => ({ trajectories: [], total: 0 }),
            exportTrajectories: async () => ({
              data: "",
              filename: "trajectories.jsonl",
              mimeType: "application/x-ndjson",
            }),
          };
        }
        if (name === "plugin_manager") {
          return {
            list: () => [1, 2],
            categories: () => ({}),
            summary: () => ({
              total: 2,
              categories: 1,
              enabled: 1,
              official: 1,
              vendored: 1,
            }),
          };
        }
        if (name === "forms") {
          return {
            listForms: () => [],
            getTemplates: () => new Map(),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      agentSdk: {
        snapshot: () => ({
          skillCatalog: { total: 10, trending: ["browser", "search"] },
        }),
      },
      skills: {
        list: () => [{ slug: "tool/one" }, { slug: "generated/test" }],
        summary: () => ({
          total: 2,
          curated: 1,
          generated: 1,
          categories: [{ name: "tool", count: 1 }],
          roots: [
            { name: "tool", count: 1 },
            { name: "generated", count: 1 },
          ],
        }),
      },
      trajectories: {
        listBundles: () => [{ id: "bundle-1" }],
        exportLatest: () => ({ id: "latest" }),
      },
      settings: {
        get: () => ({ ui: { theme: "light" } }),
      },
      web: {
        status: () => ({ ready: false }),
      },
      mcp: {
        status: () => ({ mode: "fallback" }),
        getCachedTools: () => [],
      },
      workspace: {
        root: () => "/tmp",
      },
      memory: {
        summary: () => ({ totalSessions: 0, recentSessionIds: [] }),
      },
      personalities: {
        summary: () => ({ total: 1, names: ["operator"] }),
      },
      userProfiles: {
        summary: () => ({ totalSessions: 0, recentSessionIds: [] }),
      },
      sessions: {
        summary: () => ({
          totalSessions: 0,
          recentSessionIds: [],
        }),
      },
      ecosystem: {
        summary: () => ({}),
        benchmarkPacks: () => [],
        distributionChannels: () => [],
        modelingProfiles: () => [],
        optionalSkillPacks: () => [],
      },
      nativeOwnership: {
        snapshot: async () => null,
      },
      skillsHub: {
        summary: () => ({}),
      },
      skillSynthesis: {
        listGeneratedSkills: () => [],
      },
      delegationProjection: {
        list: () => [
          { id: "task-1", status: "pending" },
          { id: "task-2", status: "pending" },
          { id: "task-3", status: "running" },
          { id: "task-4", status: "running" },
          { id: "task-5", status: "cancelled" },
        ],
        queueSummary: () => ({ pending: 2, activeWorkers: 2 }),
      },
      repo: {
        status: () => null,
      },
    } as unknown as AppServices;

    const controlPlane = getAutonomousControlPlane(runtime, services, {
      falApiKey: "fal-key",
    } as never);

    expect(controlPlane.orchestrator.tasks).toBe(5);
    expect(controlPlane.orchestrator.queuePending).toBe(2);
    expect(controlPlane.orchestrator.activeWorkers).toBe(2);
    expect(controlPlane.orchestrator).toMatchObject({
      source: "native",
      available: true,
    });
    expect(controlPlane.skills).toMatchObject({
      source: "native",
      available: true,
    });
    expect(controlPlane.codingAgent).toMatchObject({
      source: "native",
      available: true,
      delegation: true,
    });
  });
});

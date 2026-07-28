import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleCodegenRoutes } from "@/server/routes/codegen";
import { handleDelegationCommandRoutes } from "@/server/routes/delegation-commands";
import { handleFormsPlanningRoutes } from "@/server/routes/forms-planning";
import { handleReviewRecordRoutes } from "@/server/routes/review-record";
import { AutocoderPipelineService } from "@/services/autocoder-pipeline";
import { DelegationService } from "@/services/delegation/service";
import { ReviewRecordService } from "@/services/review-record";
import { serveFetchTest } from "@/testing/fetch-server";
import { createOfficialOrchestratorTestFixture } from "@/testing/official-orchestrator";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createFixtureContext(workspaceDir: string, dataDir: string) {
  const plans: Array<Record<string, unknown>> = [];
  const official = createOfficialOrchestratorTestFixture();
  const delegation = new DelegationService();
  const pipeline = new AutocoderPipelineService(join(dataDir, "pipeline"));
  const reviewRecords = new ReviewRecordService(join(dataDir, "review"));
  const runtime = {
    getService(name: string) {
      if (name === "ORCHESTRATOR_TASK_SERVICE") {
        return official.service;
      }
      if (name === "planning") {
        return {
          listPlans: () => plans,
          createPlan: (input: Record<string, unknown>) => {
            const plan = { id: `plan-${plans.length + 1}`, ...input };
            plans.push(plan);
            return plan;
          },
          getPlan: (id: string) => plans.find((plan) => plan.id === id),
        };
      }
      if (name === "code-generation") {
        return {
          generateCode: async (input: Record<string, unknown>) => {
            writeFileSync(
              join(workspaceDir, "src", "greeting.ts"),
              'export const greeting = "hello, Doolittle";\n',
              "utf8",
            );
            return {
              changedFiles: ["src/greeting.ts"],
              deterministic: true,
              prompt: input.prompt,
              verification: "fixture wrote the expected source file",
            };
          },
        };
      }
      return undefined;
    },
  };
  return {
    context: {
      config: { workspaceDir },
      runtime,
      services: {
        autocoderPipeline: pipeline,
        delegation,
        repository: {
          resolveWorktreeRoot: async (candidate: string) => {
            if (candidate !== workspaceDir) {
              throw new Error("Fixture workspace root was not selected.");
            }
            return workspaceDir;
          },
          summary: async () => ({
            isRepository: true,
            root: workspaceDir,
            branch: "fixture/coding-loop",
            head: "fixture-head",
            ahead: 0,
            behind: 0,
            dirty: true,
            changedFiles: 1,
          }),
        },
        reviewRecords,
      },
    } as unknown as AppContext,
    pipeline,
    reviewRecords,
  };
}

async function dispatch(context: AppContext, request: Request) {
  const url = new URL(request.url);
  for (const handler of [
    handleFormsPlanningRoutes,
    handleDelegationCommandRoutes,
    handleCodegenRoutes,
    handleReviewRecordRoutes,
  ]) {
    const response = await handler(context, request, url);
    if (response) return response;
  }
  return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
}

function jsonRequest(path: string, body: unknown) {
  return new Request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Doolittle coding-loop acceptance fixture", () => {
  it("persists a deterministic workspace-to-review receipt without a model provider", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-coding-loop-"));
    temporaryDirectories.push(root);
    const workspaceDir = join(root, "workspace");
    const dataDir = join(root, "data");
    mkdirSync(join(workspaceDir, "src"), { recursive: true });
    writeFileSync(
      join(workspaceDir, "src", "greeting.ts"),
      'export const greeting = "TODO";\n',
      "utf8",
    );
    const { context, pipeline, reviewRecords } = createFixtureContext(
      workspaceDir,
      dataDir,
    );
    const server = await serveFetchTest((request) =>
      dispatch(context, request),
    );
    const baseUrl = `http://127.0.0.1:${server.port}`;

    try {
      expect(
        readFileSync(join(workspaceDir, "src", "greeting.ts"), "utf8"),
      ).toContain("TODO");
      const planResponse = await fetch(
        jsonRequest(`${baseUrl}/plans/create`, {
          title: "Repair greeting fixture",
          objective: "Replace the known TODO with a tested greeting.",
          steps: ["Inspect the source", "Apply the focused change", "Verify"],
        }),
      );
      expect(planResponse.status).toBe(200);
      await expect(planResponse.json()).resolves.toMatchObject({
        plan: { id: "plan-1", title: "Repair greeting fixture" },
      });

      const taskResponse = await fetch(
        jsonRequest(`${baseUrl}/delegation/tasks`, {
          title: "Inspect fixture workspace",
          objective: "Confirm the known greeting TODO before generation.",
          workspaceRoot: workspaceDir,
          labels: ["fixture", "workspace-evidence"],
        }),
      );
      expect(taskResponse.status).toBe(200);
      await expect(taskResponse.json()).resolves.toMatchObject({
        task: {
          title: "Inspect fixture workspace",
          workspaceRoot: workspaceDir,
        },
      });

      const generationResponse = await fetch(
        jsonRequest(`${baseUrl}/codegen/generate`, {
          projectName: "fixture-workspace",
          prompt:
            "Replace the greeting TODO with the deterministic fixture value.",
        }),
      );
      expect(generationResponse.status).toBe(200);
      const generation = (await generationResponse.json()) as {
        run: { id: string; status: string; artifactPaths: string[] };
        workflowId: string;
        taskId: string;
        generation: {
          changedFiles: string[];
          deterministic: boolean;
          prompt: string;
          verification: string;
        };
      };
      expect(generation.run.status).toBe("completed");
      expect(generation.run.artifactPaths.length).toBeGreaterThanOrEqual(1);
      expect(generation.workflowId).toBeTruthy();
      expect(generation.taskId).toBeTruthy();
      expect(generation.generation).toEqual({
        changedFiles: ["src/greeting.ts"],
        deterministic: true,
        prompt:
          "Replace the greeting TODO with the deterministic fixture value.",
        verification: "fixture wrote the expected source file",
      });
      expect(
        readFileSync(join(workspaceDir, "src", "greeting.ts"), "utf8"),
      ).toBe('export const greeting = "hello, Doolittle";\n');

      const receiptResponse = await fetch(
        `${baseUrl}/codegen/runs/${generation.run.id}`,
      );
      expect(receiptResponse.status).toBe(200);
      await expect(receiptResponse.json()).resolves.toMatchObject({
        run: {
          id: generation.run.id,
          status: "completed",
          workflowId: generation.workflowId,
          taskId: generation.taskId,
        },
      });
      expect(pipeline.get(generation.run.id)?.status).toBe("completed");
      const artifactResponse = await fetch(
        `${baseUrl}/codegen/runs/${generation.run.id}/artifacts/0`,
      );
      expect(artifactResponse.status).toBe(200);
      await expect(artifactResponse.json()).resolves.toMatchObject({
        artifact: { index: 0, runId: generation.run.id },
        content: expect.stringContaining("fixture-workspace"),
      });

      const reviewResponse = await fetch(
        jsonRequest(`${baseUrl}/review-record/comments`, {
          comment: {
            id: "fixture-review",
            path: "src/greeting.ts",
            body: "Verified the deterministic greeting fixture after the run receipt.",
            anchor: {
              side: "new",
              line: 1,
              preview: 'export const greeting = "hello, Doolittle";',
            },
          },
        }),
      );
      expect(reviewResponse.status).toBe(201);
      await expect(reviewResponse.json()).resolves.toMatchObject({
        record: {
          scope: {
            repositoryRoot: workspaceDir,
            branch: "fixture/coding-loop",
          },
          comments: [{ id: "fixture-review", status: "open" }],
        },
      });
      const recordResponse = await fetch(`${baseUrl}/review-record?limit=10`);
      expect(recordResponse.status).toBe(200);
      const record = (await recordResponse.json()) as {
        entries: Array<Record<string, unknown>>;
      };
      expect(
        record.entries.find((entry) => entry.id === "fixture-review"),
      ).toMatchObject({
        id: "fixture-review",
        path: "src/greeting.ts",
        anchor: { line: 1, side: "new" },
      });
      expect(
        reviewRecords.get({
          repositoryRoot: workspaceDir,
          branch: "fixture/coding-loop",
          head: "fixture-head",
        }).events,
      ).toHaveLength(1);
    } finally {
      server.stop(true);
    }
  });
});

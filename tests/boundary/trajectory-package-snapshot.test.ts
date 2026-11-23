import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleTrajectoryRoutes } from "../../packages/agent/src/server/routes/trajectories";
import type { SessionService } from "../../packages/agent/src/services/session/service";
import { TrajectoryEvaluationService } from "../../packages/agent/src/services/trajectory/service";
import type {
  TrajectoryRecord,
  TrajectoryResearchPackageBundle,
} from "../../packages/agent/src/types/trajectory";

it.each(["manifestPath", "label", "latest"])(
  "packages the saved snapshot selected by %s after history and filters change",
  async (selector) => {
    const baseDir = mkdtempSync(join(tmpdir(), "trajectory-package-"));
    try {
      let records: TrajectoryRecord[] = [
        {
          sessionId: "saved-session",
          role: "user",
          text: "saved snapshot",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ];
      const service = new TrajectoryEvaluationService(baseDir, {
        recent: () => records,
      } as unknown as SessionService);
      const filters = {
        sessionId: "saved-session",
        role: "user" as const,
        label: "saved",
        mode: "dataset" as const,
      };
      const saved = service.exportFilteredBundle(filters);
      const original = readFileSync(saved.dataPath, "utf8");
      records = [{ ...records[0], text: "new history" }];
      filters.sessionId = "different-session";
      const query = new URLSearchParams({
        [selector]:
          selector === "latest"
            ? "true"
            : selector === "label"
              ? "saved"
              : saved.manifestPath,
        sessionId: filters.sessionId,
        role: "assistant",
      });
      const url = new URL(`http://127.0.0.1/trajectories/package?${query}`);
      const context = {
        services: { trajectoryEvaluation: service },
      } as unknown as AppContext;
      const response = await handleTrajectoryRoutes(
        context,
        new Request(url),
        url,
      );
      const result = (await response?.json()) as {
        package: TrajectoryResearchPackageBundle;
      };
      expect(readFileSync(result.package.bundle.dataPath, "utf8")).toBe(
        original,
      );
      expect(result.package.bundle.manifestPath).toBe(saved.manifestPath);
      expect(
        result.package.replay.replayPreview.map(({ text }) => text),
      ).toEqual(["saved snapshot"]);
      expect(result.package.evaluation.bundle.manifestPath).toBe(
        saved.manifestPath,
      );
      expect(result.package.analysis.prompt).not.toContain("new history");
      expect(result.package.mode).toBe("dataset");
      expect(result.package.analysis.mode).toBe("dataset");
      expect(
        JSON.parse(readFileSync(result.package.packageManifestPath, "utf8"))
          .analysis.mode,
      ).toBe("dataset");
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  },
);

it("keeps empty saved bundles empty and reports missing selections", async () => {
  const baseDir = mkdtempSync(join(tmpdir(), "trajectory-package-"));
  try {
    const service = new TrajectoryEvaluationService(baseDir, {
      recent: () => [],
    } as unknown as SessionService);
    expect(await service.packageLatest()).toBeUndefined();
    const saved = service.exportFilteredBundle({ label: "empty" });
    const packaged = await service.packageLatest();
    expect(packaged?.bundle.manifestPath).toBe(saved.manifestPath);
    expect(packaged?.replay.replayPreview).toEqual([]);
    await expect(
      service.package({ manifestPath: join(baseDir, "missing.json") }),
    ).rejects.toThrow();
    const url = new URL("http://127.0.0.1/trajectories/package?label=missing");
    const context = {
      services: { trajectoryEvaluation: service },
    } as unknown as AppContext;
    const response = await handleTrajectoryRoutes(
      context,
      new Request(url),
      url,
    );
    expect(response?.status).toBe(404);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

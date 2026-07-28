import { describe, expect, it } from "vitest";
import { DelegationService } from "./service";

describe("DelegationService read projection", () => {
  it("projects official task records without owning persistence", () => {
    const service = new DelegationService();
    service.replaceProjection([
      {
        id: "task-1",
        title: "Official task",
        objective: "Use the official service",
        status: "running",
        executionMode: "delegated",
        notes: [],
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:01:00.000Z",
      },
    ]);

    expect(service.list()).toEqual([
      expect.objectContaining({ id: "task-1", status: "running" }),
    ]);
    expect(service.overview()).toMatchObject({
      total: 1,
      running: 1,
      delegated: 1,
    });
  });

  it("exposes no product-owned lifecycle or worker APIs", () => {
    const service = new DelegationService() as unknown as Record<
      string,
      unknown
    >;

    expect(service.create).toBeUndefined();
    expect(service.markWorkerStarted).toBeUndefined();
    expect(service.getWorkerPaths).toBeUndefined();
    expect(service.superviseQueued).toBeUndefined();
  });
});

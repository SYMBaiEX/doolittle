import { expect, it, vi } from "vitest";
import { ApplicationSession } from "../../packages/agent/src/runtime/application/session";

const startup = vi.hoisted(() => ({
  loadBootstrap: vi.fn(),
  buildContext: vi.fn(),
  loadTeardown: vi.fn(),
  disposeRuntime: vi.fn(),
}));

vi.mock("../../packages/agent/src/runtime/bootstrap/app-context", () => {
  startup.loadBootstrap();
  return { buildAppContext: startup.buildContext };
});

vi.mock(
  "../../packages/agent/src/runtime/bootstrap/runtime/initialization",
  () => {
    startup.loadTeardown();
    return { disposeRuntime: startup.disposeRuntime };
  },
);

vi.mock("../../packages/agent/src/runtime/application/service-graph", () => ({
  createApplicationServiceGraph: () => ({
    services: {
      acp: {
        bindProtocolHost: vi.fn(),
        cancelAllProtocolSessions: vi.fn(),
      },
    },
  }),
}));

vi.mock("../../packages/agent/src/runtime/application/acp-host", () => ({
  createApplicationAcpHost: () => ({ dispose: vi.fn() }),
}));

it("keeps setup-only sessions idle and shares one runtime lifecycle on activation", async () => {
  const setupOnly = new ApplicationSession();
  expect(setupOnly.services.acp.bindProtocolHost).toHaveBeenCalledOnce();
  expect(setupOnly.phase).toBe("idle");
  await setupOnly.dispose();
  expect(startup.loadBootstrap).not.toHaveBeenCalled();
  expect(startup.loadTeardown).not.toHaveBeenCalled();

  const abandoned = new ApplicationSession();
  const closing = abandoned.ensureRuntime({ startupMode: "cli" });
  const cancelled = expect(closing).rejects.toThrow("Fixture closed");
  await abandoned.dispose("Fixture closed");
  await cancelled;
  expect(startup.buildContext).not.toHaveBeenCalled();
  expect(startup.loadTeardown).not.toHaveBeenCalled();

  const runtime = {};
  startup.buildContext.mockImplementation(async (_, ownership) => {
    ownership.acquired(runtime);
    return { runtime };
  });
  const session = new ApplicationSession();
  const [first, second] = await Promise.all([
    session.ensureRuntime({ startupMode: "cli" }),
    session.ensureRuntime({ startupMode: "cli" }),
  ]);
  expect(first).toBe(second);
  expect(startup.buildContext).toHaveBeenCalledOnce();
  expect(session.ownsRuntime(first.runtime)).toBe(true);

  await session.dispose();
  expect(startup.disposeRuntime).toHaveBeenCalledOnce();
  expect(session.phase).toBe("disposed");
  await expect(session.ensureRuntime()).rejects.toThrow("closed");
});

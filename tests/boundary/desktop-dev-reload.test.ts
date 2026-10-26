import { afterEach, expect, it, vi } from "vitest";
import { DesktopDevReload } from "../../apps/desktop/scripts/dev-reload";

afterEach(() => vi.useRealTimers());

it("waits for all builds and coalesces shared-file changes into one restart", async () => {
  vi.useFakeTimers();
  const restart = vi.fn(async () => {});
  const reload = new DesktopDevReload(
    ["runtime", "main", "preload"],
    restart,
    vi.fn(),
  );
  for (const surface of ["runtime", "main", "preload"])
    reload.buildStarted(surface);
  reload.buildFinished("runtime", true);
  reload.buildFinished("main", true);
  await vi.advanceTimersByTimeAsync(200);
  expect(restart).not.toHaveBeenCalled();
  reload.buildFinished("preload", true);
  await vi.advanceTimersByTimeAsync(200);
  expect(restart).toHaveBeenCalledTimes(1);
  for (const surface of ["runtime", "main"]) {
    reload.buildStarted(surface);
    reload.buildFinished(surface, true);
  }
  await vi.advanceTimersByTimeAsync(200);
  expect(restart).toHaveBeenCalledTimes(2);
  reload.close();
});

it("keeps the running app through a failed edit and recovers after a successful build", async () => {
  vi.useFakeTimers();
  const restart = vi.fn(async () => {});
  const reload = new DesktopDevReload(["main"], restart, vi.fn());
  reload.buildStarted("main");
  reload.buildFinished("main", true);
  await vi.advanceTimersByTimeAsync(200);
  reload.buildStarted("main");
  reload.buildFinished("main", false);
  await vi.advanceTimersByTimeAsync(200);
  expect(restart).toHaveBeenCalledTimes(1);
  reload.buildStarted("main");
  reload.buildFinished("main", true);
  await vi.advanceTimersByTimeAsync(200);
  expect(restart).toHaveBeenCalledTimes(2);
  reload.close();
});

it("does not launch stale builds or overlap restarts while shutdown is pending", async () => {
  vi.useFakeTimers();
  let finishStop!: () => void;
  const stop = new Promise<void>((resolve) => {
    finishStop = resolve;
  });
  const starts = vi.fn();
  const restart = vi.fn(async (canStart: () => boolean) => {
    await stop;
    if (canStart()) starts();
  });
  const reload = new DesktopDevReload(["runtime"], restart, vi.fn());
  reload.buildStarted("runtime");
  reload.buildFinished("runtime", true);
  await vi.advanceTimersByTimeAsync(200);
  reload.buildStarted("runtime");
  finishStop();
  await vi.advanceTimersByTimeAsync(200);
  expect(starts).not.toHaveBeenCalled();
  reload.buildFinished("runtime", true);
  await vi.advanceTimersByTimeAsync(200);
  expect(starts).toHaveBeenCalledTimes(1);
  expect(restart).toHaveBeenCalledTimes(2);
  reload.invalidate();
  reload.close();
  await vi.advanceTimersByTimeAsync(200);
  expect(starts).toHaveBeenCalledTimes(1);
});

it("does not retry a blocked quit until another edit", async () => {
  vi.useFakeTimers();
  const error = new Error("quit refused");
  const onError = vi.fn();
  const restart = vi
    .fn()
    .mockRejectedValueOnce(error)
    .mockResolvedValue(undefined);
  const reload = new DesktopDevReload(["main"], restart, onError);
  reload.buildStarted("main");
  reload.buildFinished("main", true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(restart).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith(error);
  reload.buildStarted("main");
  reload.buildFinished("main", true);
  await vi.advanceTimersByTimeAsync(200);
  expect(restart).toHaveBeenCalledTimes(2);
  reload.close();
});

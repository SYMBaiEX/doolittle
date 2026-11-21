import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { main } from "../../packages/evals/src/coding/cli";

const temporaryDirectories: string[] = [];

async function evaluationArguments() {
  const workspace = await mkdtemp(join(tmpdir(), "doolittle-eval-inputs-"));
  temporaryDirectories.push(workspace);
  const journal = join(workspace, "events.ndjson");
  return {
    journal,
    args: [
      "--gateway",
      "http://127.0.0.1:1234",
      "--journal",
      journal,
      "--workspace",
      workspace,
      "--case",
      "verified-noop-v1",
      "--run",
      "fixture-run",
      "--no-report",
    ],
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

it("cancels outstanding receipt requests when one fails", async () => {
  const { args } = await evaluationArguments();
  let receivedSignal: AbortSignal | undefined;
  vi.stubGlobal("fetch", (url: URL, { signal }: { signal: AbortSignal }) => {
    if (url.pathname.endsWith("/fixture-run")) {
      return Promise.resolve(new Response(null, { status: 502 }));
    }
    receivedSignal = signal;
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  });

  await expect(main([...args, "--run", "another-run"])).rejects.toThrow(
    "Gateway returned HTTP 502 for /chat/runs/fixture-run",
  );
  expect(receivedSignal?.aborted).toBe(true);
});

it("reports selected runs even when the journal contains non-event JSON", async () => {
  const { args, journal } = await evaluationArguments();
  vi.stubGlobal("fetch", async () => {
    // A run may append evidence up to the point where it returns its receipt.
    await writeFile(journal, 'null\n"text"\n{}\n{"runId":"a-different-run"}\n');
    return Response.json({ run: { runId: "fixture-run", status: "queued" } });
  });
  const output = vi.spyOn(console, "log").mockImplementation(() => {});

  await expect(main(args)).resolves.toBe(0);
  expect(output).toHaveBeenCalledWith(expect.stringContaining("1 incomplete"));
});

it("bounds concurrent receipt requests for a large selection", async () => {
  const { args, journal } = await evaluationArguments();
  await writeFile(journal, "");
  let active = 0;
  let peak = 0;
  vi.stubGlobal("fetch", async (url: URL) => {
    active += 1;
    peak = Math.max(peak, active);
    await setImmediate();
    active -= 1;
    return Response.json({
      run: { runId: url.pathname.split("/").at(-1), status: "queued" },
    });
  });
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const additional = Array.from({ length: 11 }, (_value, index) => [
    "--run",
    `fixture-${index}`,
  ]).flat();

  await expect(main([...args, ...additional])).resolves.toBe(0);
  expect(peak).toBe(8);
  expect(output).toHaveBeenCalledWith(expect.stringContaining("12 incomplete"));
});

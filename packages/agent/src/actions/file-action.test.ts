import { describe, expect, it, vi } from "vitest";
import {
  getScopedTurnActionResults,
  runWithTurnRuntimeScope,
} from "@/runtime/turn-runtime-scope";
import { createFileActions } from "./file-action";

function action(name: string) {
  const selected = createFileActions().find(
    (candidate) => candidate.name === name,
  );
  if (!selected) throw new Error(`Missing action ${name}`);
  return selected;
}

function runtimeWithCodingService(service: Record<string, unknown>) {
  return {
    getSetting: () => undefined,
    getService(name: string) {
      return name === "doolittle_coding_agent" ? service : null;
    },
  } as never;
}

function codingService(overrides: Record<string, unknown> = {}) {
  return {
    workspaceRoot: () => "/workspace",
    workspaceSummary: () => "workspace",
    read: vi.fn(),
    write: vi.fn(),
    search: vi.fn(),
    repoStatus: vi.fn(),
    repoDiff: vi.fn(),
    repoLog: vi.fn(),
    run: vi.fn(),
    findCodebases: vi.fn(),
    readLines: vi.fn(() => ({
      path: "/workspace/src/app.ts",
      offset: 2,
      end: 3,
      total: 5,
      lines: [
        { number: 2, text: "two" },
        { number: 3, text: "three" },
      ],
    })),
    writeFile: vi.fn(async () => ({
      path: "/workspace/src/app.ts",
      bytes: 12,
    })),
    createDirectory: vi.fn(() => ({
      path: "/workspace/src/new",
      existed: false,
    })),
    patch: vi.fn(async () => ({
      path: "/workspace/src/app.ts",
      bytes: 14,
      replacements: 1,
    })),
    searchFiles: vi.fn(() => ({
      root: "/workspace",
      pattern: "app",
      target: "content",
      matches: [{ path: "src/app.ts", line: 4, text: "const app = true;" }],
    })),
    ...overrides,
  };
}

describe("file actions", () => {
  describe("committed mutation receipts", () => {
    const mutations: Array<{
      name: string;
      parameters: Record<string, string>;
      serviceMethod: "writeFile" | "createDirectory" | "patch";
    }> = [
      {
        name: "WRITE_FILE",
        parameters: { path: "src/app.ts", content: "export {};\n" },
        serviceMethod: "writeFile",
      },
      {
        name: "CREATE_DIRECTORY",
        parameters: { path: "src/new" },
        serviceMethod: "createDirectory",
      },
      {
        name: "PATCH_FILE",
        parameters: { path: "src/app.ts", oldText: "old", newText: "new" },
        serviceMethod: "patch",
      },
    ];

    it.each(mutations)(
      "retains $name before delivering its prose callback",
      async ({ name, parameters }) => {
        const runtime = runtimeWithCodingService(codingService());
        await runWithTurnRuntimeScope(
          runtime,
          { settings: new Map(), settledActionResults: [] },
          async () => {
            const callback = vi.fn(async () => {
              expect(getScopedTurnActionResults(runtime)).toEqual([
                expect.objectContaining({
                  success: true,
                  data: expect.objectContaining({
                    mutationAction: name,
                    mutation: expect.objectContaining({
                      action: name,
                      success: true,
                    }),
                  }),
                }),
              ]);
              return [];
            });
            const result = await action(name).handler(
              runtime,
              {
                roomId: "room-1",
                content: { text: "Synthetic mutation." },
              } as never,
              undefined,
              { parameters },
              callback,
            );
            expect(result?.success).toBe(true);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(getScopedTurnActionResults(runtime)).toEqual([result]);
          },
        );
      },
    );

    it.each(mutations)(
      "does not relabel committed $name as failed when delivery throws",
      async ({ name, parameters, serviceMethod }) => {
        const service = codingService();
        const runtime = runtimeWithCodingService(service);
        await runWithTurnRuntimeScope(
          runtime,
          { settings: new Map(), settledActionResults: [] },
          async () => {
            const callback = vi.fn(async () => {
              throw new Error("Synthetic delivery failure.");
            });
            const result = await action(name).handler(
              runtime,
              {
                roomId: "room-1",
                content: { text: "Synthetic mutation." },
              } as never,
              undefined,
              { parameters },
              callback,
            );
            expect(
              service[serviceMethod as keyof typeof service],
            ).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(result).toMatchObject({
              success: true,
              data: {
                mutationAction: name,
                mutation: { action: name, success: true },
                callbackDelivery: "failed",
              },
            });
            expect(getScopedTurnActionResults(runtime)).toEqual([result]);
          },
        );
      },
    );

    it.each(mutations)(
      "keeps failed $name separate from a delivery failure",
      async ({ name, parameters, serviceMethod }) => {
        const service = codingService({
          [serviceMethod]: vi.fn(() => {
            throw new Error("Synthetic operation failure.");
          }),
        });
        const runtime = runtimeWithCodingService(service);
        await runWithTurnRuntimeScope(
          runtime,
          { settings: new Map(), settledActionResults: [] },
          async () => {
            const callback = vi.fn(async () => {
              throw new Error("Synthetic delivery failure.");
            });
            const result = await action(name).handler(
              runtime,
              { content: { text: "Synthetic mutation." } } as never,
              undefined,
              { parameters },
              callback,
            );
            expect(result).toMatchObject({
              success: false,
              text: `${name} failed: Synthetic operation failure.`,
              data: {
                mutation: { success: false },
                callbackDelivery: "failed",
              },
            });
            expect(callback).toHaveBeenCalledTimes(1);
            expect(getScopedTurnActionResults(runtime)).toEqual([]);
          },
        );
      },
    );

    it.each(mutations)(
      "does not begin $name after scoped cancellation",
      async ({ name, parameters, serviceMethod }) => {
        const service = codingService();
        const runtime = runtimeWithCodingService(service);
        const abort = new AbortController();
        const reason = new Error("Synthetic cancellation.");
        abort.abort(reason);
        await runWithTurnRuntimeScope(
          runtime,
          {
            settings: new Map(),
            settledActionResults: [],
            abortSignal: abort.signal,
          },
          async () => {
            const callback = vi.fn(async () => []);
            await expect(
              action(name).handler(
                runtime,
                { content: { text: "Synthetic mutation." } } as never,
                undefined,
                { parameters },
                callback,
              ),
            ).rejects.toBe(reason);
            expect(
              service[serviceMethod as keyof typeof service],
            ).not.toHaveBeenCalled();
            expect(callback).not.toHaveBeenCalled();
            expect(getScopedTurnActionResults(runtime)).toEqual([]);
          },
        );
      },
    );

    it.each(mutations)(
      "retains committed $name without swallowing cancellation during delivery",
      async ({ name, parameters, serviceMethod }) => {
        const service = codingService();
        const runtime = runtimeWithCodingService(service);
        const abort = new AbortController();
        const reason = new Error("Synthetic cancellation.");
        await runWithTurnRuntimeScope(
          runtime,
          {
            settings: new Map(),
            settledActionResults: [],
            abortSignal: abort.signal,
          },
          async () => {
            const callback = vi.fn(async () => {
              abort.abort(reason);
              throw new Error("Secondary delivery failure.");
            });
            await expect(
              action(name).handler(
                runtime,
                { content: { text: "Synthetic mutation." } } as never,
                undefined,
                { parameters },
                callback,
              ),
            ).rejects.toBe(reason);
            expect(
              service[serviceMethod as keyof typeof service],
            ).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(getScopedTurnActionResults(runtime)).toEqual([
              expect.objectContaining({ success: true }),
            ]);
          },
        );
      },
    );
  });

  it("exposes every structured operation to the Eliza planner", async () => {
    const actions = createFileActions();
    const message = {
      content: { text: "Please handle the selected project." },
    } as never;

    await expect(
      Promise.all(
        actions.map((candidate) => candidate.validate({} as never, message)),
      ),
    ).resolves.toEqual(actions.map(() => true));
    expect(actions.map((candidate) => candidate.name)).toEqual([
      "READ_FILE",
      "WRITE_FILE",
      "CREATE_DIRECTORY",
      "PATCH_FILE",
      "SEARCH_FILES",
    ]);
    expect(
      actions.every(
        (candidate) =>
          candidate.cacheStable === true &&
          Boolean(candidate.descriptionCompressed) &&
          Boolean(candidate.routingHint) &&
          (candidate.parameters?.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it("routes reads through the active Eliza coding-agent service", async () => {
    const service = codingService();
    const result = await action("READ_FILE").handler(
      runtimeWithCodingService(service),
      { content: { text: "read src/app.ts" } } as never,
      undefined,
      { parameters: { path: "src/app.ts", offset: 2, limit: 2 } },
    );

    expect(service.readLines).toHaveBeenCalledWith("src/app.ts", {
      offset: 2,
      limit: 2,
    });
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("2|two"),
      verifiedUserFacing: false,
      data: {
        fileOperation: { type: "read", target: "src/app.ts" },
      },
    });
    expect(result?.userFacingText).toBeUndefined();
  });

  it("resolves the coding-agent service for every invocation", async () => {
    const first = codingService({
      readLines: vi.fn(() => ({
        path: "/first/marker.txt",
        offset: 1,
        end: 1,
        total: 1,
        lines: [{ number: 1, text: "first" }],
      })),
    });
    const second = codingService({
      readLines: vi.fn(() => ({
        path: "/second/marker.txt",
        offset: 1,
        end: 1,
        total: 1,
        lines: [{ number: 1, text: "second" }],
      })),
    });
    let current = first;
    const runtime = {
      getService(name: string) {
        return name === "doolittle_coding_agent" ? current : null;
      },
    } as never;
    const read = action("READ_FILE");
    const invoke = () =>
      read.handler(
        runtime,
        { content: { text: "read marker" } } as never,
        undefined,
        { parameters: { path: "marker.txt" } },
      );

    await expect(invoke()).resolves.toMatchObject({
      text: expect.stringContaining("first"),
    });
    current = second;
    await expect(invoke()).resolves.toMatchObject({
      text: expect.stringContaining("second"),
    });
  });

  it("keeps SEARCH_FILES target separate from its path", async () => {
    const service = codingService({
      searchFiles: vi.fn(() => ({
        root: "/workspace",
        pattern: "script",
        target: "files",
        matches: [{ path: "src/script.ts" }],
      })),
    });
    const result = await action("SEARCH_FILES").handler(
      runtimeWithCodingService(service),
      { content: { text: "find script files" } } as never,
      undefined,
      {
        parameters: {
          pattern: "script",
          path: "src",
          target: "files",
          limit: 7,
        },
      },
    );

    expect(service.searchFiles).toHaveBeenCalledWith({
      pattern: "script",
      path: "src",
      target: "files",
      limit: 7,
    });
    expect(result).toMatchObject({
      success: true,
      text: expect.stringContaining("src/script.ts"),
      verifiedUserFacing: false,
    });
    expect(result?.userFacingText).toBeUndefined();
  });

  it("builds mutation metadata from structured service results", async () => {
    const service = codingService();
    const result = await action("WRITE_FILE").handler(
      runtimeWithCodingService(service),
      { roomId: "room-1", content: { text: "write a file" } } as never,
      undefined,
      {
        parameters: {
          path: "src/app.ts",
          content: "export {};\n",
        },
      },
    );

    expect(service.writeFile).toHaveBeenCalledWith(
      "src/app.ts",
      "export {};\n",
    );
    expect(result).toMatchObject({
      success: true,
      text: "Wrote: /workspace/src/app.ts\nBytes: 12",
      data: {
        mutationKind: "local-file",
        mutation: {
          action: "WRITE_FILE",
          requestedPath: "src/app.ts",
          resolvedPath: "/workspace/src/app.ts",
          success: true,
          bytes: 12,
        },
        fileOperation: {
          type: "write",
          target: "src/app.ts",
          size: 12,
        },
      },
    });
  });

  it("routes directory creation and patches through the same service", async () => {
    const service = codingService();
    const runtime = runtimeWithCodingService(service);

    const directory = await action("CREATE_DIRECTORY").handler(
      runtime,
      { content: { text: "create src/new" } } as never,
      undefined,
      { parameters: { path: "src/new" } },
    );
    const patch = await action("PATCH_FILE").handler(
      runtime,
      { content: { text: "patch src/app.ts" } } as never,
      undefined,
      {
        parameters: {
          path: "src/app.ts",
          oldText: "old",
          newText: "new",
          replaceAll: true,
        },
      },
    );

    expect(service.createDirectory).toHaveBeenCalledWith("src/new");
    expect(service.patch).toHaveBeenCalledWith("src/app.ts", "old", "new", {
      replaceAll: true,
    });
    expect(directory).toMatchObject({
      success: true,
      data: {
        mutation: { resolvedPath: "/workspace/src/new" },
      },
    });
    expect(patch).toMatchObject({
      success: true,
      data: {
        mutation: { replacements: 1 },
      },
    });
  });

  it("uses the SDK validator before invoking the service", async () => {
    const service = codingService();
    const result = await action("WRITE_FILE").handler(
      runtimeWithCodingService(service),
      { roomId: "room-1", content: { text: "write a file" } } as never,
      undefined,
      { parameters: { path: "src/app.ts" } },
    );

    expect(result?.success).toBe(false);
    expect(result?.text).toContain(
      "Required parameter 'content' was not provided for action WRITE_FILE",
    );
    expect(service.writeFile).not.toHaveBeenCalled();
  });

  it("fails truthfully when the required Eliza service is unavailable", async () => {
    const result = await action("READ_FILE").handler(
      { getService: () => null } as never,
      { content: { text: "read a file" } } as never,
      undefined,
      { parameters: { path: "README.md" } },
    );

    expect(result).toMatchObject({
      success: false,
      text: expect.stringMatching(/coding_agent/u),
    });
  });
});

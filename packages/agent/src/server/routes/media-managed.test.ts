import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import {
  createTransientDictationOutputDir,
  materializeTransientDictationInput,
  resolveTransientDictation,
} from "@/services/transient-dictation";
import { handleManagedMediaRoutes } from "./media-managed";

const roots: string[] = [];

function createDataDir(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "doolittle-managed-media-"));
  roots.push(dataDir);
  mkdirSync(join(dataDir, "attachments"), { recursive: true });
  return dataDir;
}

function writeAttachment(
  dataDir: string,
  kind: "audio" | "document",
): { id: string; path: string } {
  const id = randomUUID();
  const content = Buffer.from(
    kind === "audio" ? "RIFF0000WAVEaudio" : "document",
  );
  const extension = kind === "audio" ? "wav" : "txt";
  const path = join(dataDir, "attachments", `${id}.${extension}`);
  writeFileSync(path, content, { mode: 0o600 });
  writeFileSync(
    join(dataDir, "attachments", `${id}.meta.json`),
    JSON.stringify({
      version: 1,
      id,
      name: kind === "audio" ? "voice.wav" : "notes.txt",
      kind,
      mimeType: kind === "audio" ? "audio/wav" : "text/plain",
      sizeBytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
      storedName: `${id}.${extension}`,
      createdAt: new Date(0).toISOString(),
    }),
    { mode: 0o600 },
  );
  return { id, path };
}

function writeTransientDictation(
  dataDir: string,
  options: { recordingTarget?: string } = {},
): { id: string; path: string; sessionDir: string } {
  const id = randomUUID();
  const sessionDir = join(dataDir, "transient", "dictation", id);
  const path = join(sessionDir, `${id}.wav`);
  const content = Buffer.from("RIFF0000WAVEaudio");
  mkdirSync(sessionDir, { recursive: true });
  if (options.recordingTarget) {
    symlinkSync(options.recordingTarget, path);
  } else {
    writeFileSync(path, content, { mode: 0o600 });
  }
  writeFileSync(
    join(sessionDir, `${id}.meta.json`),
    JSON.stringify({
      version: 1,
      id,
      name: "dictation.wav",
      kind: "audio",
      mimeType: "audio/wav",
      sizeBytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
      storedName: `${id}.wav`,
      createdAt: new Date(0).toISOString(),
    }),
    { mode: 0o600 },
  );
  return { id, path, sessionDir };
}

function createContext(
  dataDir: string,
  transcribeWithModel: ReturnType<typeof vi.fn> = vi.fn(
    async (path: string, options?: Record<string, unknown>) => ({
      inspection: { path },
      bundle: { manifestPath: path },
      prompt: "prompt",
      transcriptText: "managed transcript",
      transcriptPath: `${path}.txt`,
      promptPath: `${path}.prompt`,
      manifestPath: `${path}.json`,
      reportPath: `${path}.md`,
      response: "managed transcript",
      responsePath: `${path}.response`,
      model: "test-model",
      provider: "test-provider",
      source: "openai" as const,
      options,
    }),
  ),
  transcribeTransient: ReturnType<typeof vi.fn> = vi.fn(
    async (
      path: string,
      outputDir: string,
      options?: Record<string, unknown>,
    ) => ({
      inspection: { path },
      bundle: { manifestPath: join(outputDir, "bundle.json") },
      prompt: "prompt",
      transcriptText: "transient transcript",
      transcriptPath: join(outputDir, "transcript.txt"),
      promptPath: join(outputDir, "prompt.md"),
      manifestPath: join(outputDir, "manifest.json"),
      reportPath: join(outputDir, "report.md"),
      response: "transient transcript",
      responsePath: join(outputDir, "response.txt"),
      model: "test-model",
      provider: "test-provider",
      source: "openai" as const,
      options,
    }),
  ),
): AppContext {
  return {
    config: { dataDir, workspaceDir: dataDir },
    services: { media: { transcribeTransient, transcribeWithModel } },
  } as unknown as AppContext;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("handleManagedMediaRoutes", () => {
  it("removes transient recording and derived artifacts after successful dictation", async () => {
    const dataDir = createDataDir();
    const dictation = writeTransientDictation(dataDir);
    const canonicalSessionDir = realpathSync(dictation.sessionDir);
    const transcribeTransient = vi.fn(
      async (path: string, outputDir: string) => {
        mkdirSync(outputDir, { recursive: true });
        const artifactNames = [
          "bundle.json",
          "bundle.md",
          "transcript.txt",
          "prompt.md",
          "manifest.json",
          "report.md",
          "response.txt",
        ];
        for (const artifactName of artifactNames) {
          writeFileSync(join(outputDir, artifactName), artifactName);
        }
        return {
          inspection: { path },
          bundle: { manifestPath: join(outputDir, "bundle.json") },
          prompt: "prompt",
          transcriptText: "private dictation",
          transcriptPath: join(outputDir, "transcript.txt"),
          promptPath: join(outputDir, "prompt.md"),
          manifestPath: join(outputDir, "manifest.json"),
          reportPath: join(outputDir, "report.md"),
          response: "private dictation",
          responsePath: join(outputDir, "response.txt"),
          model: "voice-model",
          provider: "openai",
          source: "openai" as const,
        };
      },
    );
    const context = createContext(dataDir, undefined, transcribeTransient);

    const response = await handleManagedMediaRoutes(
      context,
      new Request("http://localhost/media/transcribe-attachment", {
        method: "POST",
        body: JSON.stringify({ attachmentId: dictation.id, name: "dictation" }),
      }),
      new URL("http://localhost/media/transcribe-attachment"),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      attachment: { id: dictation.id, kind: "audio" },
      transcription: { transcriptText: "private dictation" },
    });
    const invocation = transcribeTransient.mock.calls[0];
    expect(invocation).toBeDefined();
    const [stagedInputPath, outputDir] = invocation ?? [];
    expect(stagedInputPath).toMatch(
      new RegExp(
        `^${join(canonicalSessionDir, "artifacts").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/\\.input-`,
      ),
    );
    expect(outputDir).toBe(join(canonicalSessionDir, "artifacts"));
    expect(transcribeTransient).toHaveBeenCalledWith(
      stagedInputPath,
      outputDir,
      expect.objectContaining({
        language: undefined,
        prompt: undefined,
        name: "dictation",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(existsSync(dictation.sessionDir)).toBe(false);
    expect(readdirSync(join(dataDir, "attachments"))).toEqual([]);
  });

  it("removes transient recording and partial artifacts when transcription fails", async () => {
    const dataDir = createDataDir();
    const dictation = writeTransientDictation(dataDir);
    const transcribeTransient = vi.fn(
      async (_path: string, outputDir: string) => {
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(join(outputDir, "partial-transcript.txt"), "private");
        throw new Error("simulated transcription failure");
      },
    );
    const context = createContext(dataDir, undefined, transcribeTransient);

    await expect(
      handleManagedMediaRoutes(
        context,
        new Request("http://localhost/media/transcribe-attachment", {
          method: "POST",
          body: JSON.stringify({ attachmentId: dictation.id }),
        }),
        new URL("http://localhost/media/transcribe-attachment"),
      ),
    ).rejects.toThrow("simulated transcription failure");
    expect(existsSync(dictation.sessionDir)).toBe(false);
  });

  it("aborts provider transcription and removes transient input and artifacts", async () => {
    const dataDir = createDataDir();
    const dictation = writeTransientDictation(dataDir);
    const controller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const transcribeTransient = vi.fn(
      async (
        _path: string,
        outputDir: string,
        options?: { signal?: AbortSignal },
      ) => {
        providerSignal = options?.signal;
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(join(outputDir, "partial-transcript.txt"), "private");
        return await new Promise<never>((_resolve, reject) => {
          providerSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    );
    const context = createContext(dataDir, undefined, transcribeTransient);
    const pending = handleManagedMediaRoutes(
      context,
      new Request("http://localhost/media/transcribe-attachment", {
        method: "POST",
        body: JSON.stringify({ attachmentId: dictation.id }),
        signal: controller.signal,
      }),
      new URL("http://localhost/media/transcribe-attachment"),
    );

    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(providerSignal?.aborted).toBe(true);
    expect(existsSync(dictation.sessionDir)).toBe(false);
  });

  it("removes a transient import when integrity validation fails", async () => {
    const dataDir = createDataDir();
    const dictation = writeTransientDictation(dataDir);
    writeFileSync(dictation.path, "RIFF0000WAVEtampered");
    const transcribeTransient = vi.fn();
    const context = createContext(dataDir, undefined, transcribeTransient);

    const response = await handleManagedMediaRoutes(
      context,
      new Request("http://localhost/media/transcribe-attachment", {
        method: "POST",
        body: JSON.stringify({ attachmentId: dictation.id }),
      }),
      new URL("http://localhost/media/transcribe-attachment"),
    );

    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ code: "integrity_failed" });
    expect(transcribeTransient).not.toHaveBeenCalled();
    expect(existsSync(dictation.sessionDir)).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "rejects a symlinked transient recording without deleting its target",
    async () => {
      const dataDir = createDataDir();
      const externalPath = join(dataDir, "external.wav");
      writeFileSync(externalPath, "RIFF0000WAVEaudio");
      const dictation = writeTransientDictation(dataDir, {
        recordingTarget: externalPath,
      });
      const transcribeTransient = vi.fn();
      const context = createContext(dataDir, undefined, transcribeTransient);

      const response = await handleManagedMediaRoutes(
        context,
        new Request("http://localhost/media/transcribe-attachment", {
          method: "POST",
          body: JSON.stringify({ attachmentId: dictation.id }),
        }),
        new URL("http://localhost/media/transcribe-attachment"),
      );

      expect(response?.status).toBe(400);
      expect(existsSync(externalPath)).toBe(true);
      expect(existsSync(dictation.sessionDir)).toBe(false);
      expect(transcribeTransient).not.toHaveBeenCalled();
    },
  );

  it.skipIf(process.platform === "win32")(
    "never reads an external target swapped in after dictation validation",
    () => {
      const dataDir = createDataDir();
      const dictation = writeTransientDictation(dataDir);
      const externalPath = join(dataDir, "external.wav");
      const externalContent = "RIFF0000WAVEexternal-secret";
      writeFileSync(externalPath, externalContent);
      const resolved = resolveTransientDictation(dataDir, dictation.id);
      expect(resolved).not.toBeNull();
      if (!resolved) throw new Error("Expected a transient dictation record");

      // The attacker replaces the pathname after it has been resolved but
      // before the provider input is materialized.
      rmSync(dictation.path);
      symlinkSync(externalPath, dictation.path);
      const outputDir = createTransientDictationOutputDir(resolved);

      expect(() =>
        materializeTransientDictationInput(resolved, outputDir),
      ).toThrow("Dictation recording failed integrity checks.");
      expect(existsSync(externalPath)).toBe(true);
      expect(readFileSync(externalPath, "utf8")).toBe(externalContent);
      expect(readdirSync(outputDir)).toEqual([]);
    },
  );

  it("transcribes a validated audio attachment without returning managed paths", async () => {
    const dataDir = createDataDir();
    const attachment = writeAttachment(dataDir, "audio");
    const transcribeWithModel = vi.fn(
      async (path: string, options?: Record<string, unknown>) => ({
        inspection: { path },
        bundle: { manifestPath: path },
        prompt: "prompt",
        transcriptText: "hello from the recording",
        transcriptPath: `${path}.txt`,
        promptPath: `${path}.prompt`,
        manifestPath: `${path}.json`,
        reportPath: `${path}.md`,
        response: "hello from the recording",
        responsePath: `${path}.response`,
        model: "voice-model",
        provider: "openai",
        source: "openai" as const,
        options,
      }),
    );
    const context = createContext(dataDir, transcribeWithModel);
    const response = await handleManagedMediaRoutes(
      context,
      new Request("http://localhost/media/transcribe-attachment", {
        method: "POST",
        body: JSON.stringify({
          attachmentId: attachment.id,
          language: "en",
          prompt: "Names: Doolittle",
          name: "dictation",
        }),
      }),
      new URL("http://localhost/media/transcribe-attachment"),
    );

    expect(response?.status).toBe(200);
    expect(transcribeWithModel).toHaveBeenCalledWith(
      realpathSync(attachment.path),
      expect.objectContaining({
        language: "en",
        prompt: "Names: Doolittle",
        name: "dictation",
        signal: expect.any(AbortSignal),
      }),
    );
    const body = await response?.json();
    expect(body).toMatchObject({
      attachment: { id: attachment.id, kind: "audio" },
      transcription: {
        transcriptText: "hello from the recording",
        model: "voice-model",
        provider: "openai",
        source: "openai",
      },
    });
    expect(JSON.stringify(body)).not.toContain(dataDir);
  });

  it("rejects invalid IDs, non-audio attachments, and unrecognized fields", async () => {
    const dataDir = createDataDir();
    const document = writeAttachment(dataDir, "document");
    const context = createContext(dataDir);
    const invalidId = await handleManagedMediaRoutes(
      context,
      new Request("http://localhost/media/transcribe-attachment", {
        method: "POST",
        body: JSON.stringify({ attachmentId: "../../voice.wav" }),
      }),
      new URL("http://localhost/media/transcribe-attachment"),
    );
    const nonAudio = await handleManagedMediaRoutes(
      context,
      new Request("http://localhost/media/transcribe-attachment", {
        method: "POST",
        body: JSON.stringify({ attachmentId: document.id }),
      }),
      new URL("http://localhost/media/transcribe-attachment"),
    );
    const extraField = await handleManagedMediaRoutes(
      context,
      new Request("http://localhost/media/transcribe-attachment", {
        method: "POST",
        body: JSON.stringify({
          attachmentId: document.id,
          path: "/tmp/escape.wav",
        }),
      }),
      new URL("http://localhost/media/transcribe-attachment"),
    );

    expect(invalidId?.status).toBe(400);
    expect(await invalidId?.json()).toMatchObject({ code: "invalid_request" });
    expect(nonAudio?.status).toBe(400);
    expect(await nonAudio?.json()).toMatchObject({
      code: "unsupported_attachment",
    });
    expect(extraField?.status).toBe(400);
    expect(JSON.stringify(await extraField?.json())).not.toContain(
      "/tmp/escape.wav",
    );
  });

  it("rejects malformed JSON and returns null for unrelated routes", async () => {
    const dataDir = createDataDir();
    const context = createContext(dataDir);
    const malformed = await handleManagedMediaRoutes(
      context,
      new Request("http://localhost/media/transcribe-attachment", {
        method: "POST",
        body: "{",
      }),
      new URL("http://localhost/media/transcribe-attachment"),
    );
    const unrelated = await handleManagedMediaRoutes(
      context,
      new Request("http://localhost/media/transcribe-attachment"),
      new URL("http://localhost/media/transcribe-attachment"),
    );

    expect(malformed?.status).toBe(400);
    expect(unrelated).toBeNull();
  });
});

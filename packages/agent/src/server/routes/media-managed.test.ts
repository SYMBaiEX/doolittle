import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
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
): AppContext {
  return {
    config: { dataDir, workspaceDir: dataDir },
    services: { media: { transcribeWithModel } },
  } as unknown as AppContext;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("handleManagedMediaRoutes", () => {
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
      {
        language: "en",
        prompt: "Names: Doolittle",
        name: "dictation",
      },
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

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fal } from "@fal-ai/client";

export interface MediaInspection {
  path: string;
  basename: string;
  extension: string;
  sizeBytes: number;
  kind: "image" | "audio" | "video" | "document" | "unknown";
  mimeType: string;
  exists: boolean;
  isDirectory: boolean;
  detail: string;
  contentHash?: string;
  textPreview?: string;
  lineCount?: number;
  wordCount?: number;
  width?: number;
  height?: number;
  pageCount?: number;
  title?: string;
  author?: string;
  durationMs?: number;
  transcriptPath?: string;
  transcriptPreview?: string;
  captionPath?: string;
  captionPreview?: string;
}

export interface MediaBundle {
  inspection: MediaInspection;
  manifestPath: string;
  reportPath: string;
  relatedFiles: string[];
}

interface MediaModelContext {
  provider: "openai" | "anthropic" | "offline";
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  openAiImageModel?: string;
  falApiKey?: string;
}

export interface MediaAnalysisBundle {
  focus: "voice" | "vision" | "research";
  inspection: MediaInspection;
  bundle: MediaBundle;
  prompt: string;
  signals: string[];
}

export interface MediaModelAnalysisBundle {
  analysis: MediaAnalysisBundle;
  response: string;
  responsePath: string;
  reportPath: string;
  manifestPath: string;
  model: string;
  provider: string;
}

export interface MediaTranscriptionBundle {
  inspection: MediaInspection;
  bundle: MediaBundle;
  prompt: string;
  transcriptText: string;
  transcriptPath: string;
  promptPath: string;
  manifestPath: string;
  reportPath: string;
  responsePath?: string;
  response?: string;
  model?: string;
  provider?: string;
  source: "openai" | "anthropic" | "sidecar" | "offline";
}

export interface MediaSpeechBundle {
  prompt: string;
  refinedText: string;
  promptPath: string;
  manifestPath: string;
  reportPath: string;
  artifactPath: string;
  artifactKind: "mp3" | "svg";
  response?: string;
  responsePath?: string;
  model?: string;
  provider?: string;
  voice?: string;
}

export interface MediaGenerationBundle {
  prompt: string;
  refinedPrompt: string;
  promptPath: string;
  manifestPath: string;
  reportPath: string;
  artifactPath: string;
  artifactKind: "png" | "svg";
  response?: string;
  responsePath?: string;
  model?: string;
  provider?: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
  ".html": "text/html",
  ".htm": "text/html",
  ".yaml": "application/x-yaml",
  ".yml": "application/x-yaml",
  ".toml": "application/toml",
  ".xml": "application/xml",
};

function slugifyPath(path: string): string {
  return (
    path
      .replace(/^[./\\]+/u, "")
      .replace(/[^a-z0-9]+/giu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 72)
      .toLowerCase() || "media"
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

export class MediaService {
  constructor(
    private readonly workspaceDir: string,
    private readonly outputDir = ".eliza-agent/media",
    private readonly getModelContext?: () => MediaModelContext,
  ) {
    mkdirSync(this.outputDir, { recursive: true });
  }

  inspect(path: string): MediaInspection {
    const resolvedPath = resolve(this.workspaceDir, path);
    const extension = extname(resolvedPath).toLowerCase();
    const mimeType = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";

    if (!existsSync(resolvedPath)) {
      return {
        path: resolvedPath,
        basename: basename(resolvedPath),
        extension,
        sizeBytes: 0,
        kind: "unknown",
        mimeType,
        exists: false,
        isDirectory: false,
        detail: "Path does not exist.",
      };
    }

    const stat = statSync(resolvedPath);
    if (stat.isDirectory()) {
      return {
        path: resolvedPath,
        basename: basename(resolvedPath),
        extension,
        sizeBytes: stat.size,
        kind: "unknown",
        mimeType: "inode/directory",
        exists: true,
        isDirectory: true,
        detail: "Path is a directory.",
      };
    }

    const kind = this.detectKind(extension);
    const imageDimensions =
      kind === "image"
        ? this.readImageDimensions(resolvedPath, extension)
        : undefined;
    const audioMetadata =
      kind === "audio"
        ? this.readAudioMetadata(resolvedPath, extension)
        : undefined;
    const contentHash = this.hashFile(resolvedPath);
    const structuredMetadata =
      kind === "document"
        ? extension === ".pdf"
          ? this.readPdfMetadata(resolvedPath)
          : this.readTextMetadata(resolvedPath, extension)
        : undefined;

    const sidecars = this.readSidecars(resolvedPath, kind);

    return {
      path: resolvedPath,
      basename: basename(resolvedPath),
      extension,
      sizeBytes: stat.size,
      kind,
      mimeType,
      exists: true,
      isDirectory: false,
      detail: imageDimensions
        ? `Image file detected with dimensions ${imageDimensions.width}x${imageDimensions.height}.`
        : audioMetadata?.durationMs
          ? `Audio file detected with duration about ${Math.round(audioMetadata.durationMs / 1000)}s.`
          : structuredMetadata
            ? extension === ".pdf"
              ? `PDF detected${structuredMetadata.pageCount ? ` with about ${structuredMetadata.pageCount} pages` : ""}${structuredMetadata.title ? ` titled ${structuredMetadata.title}` : ""}.`
              : `Detected as ${kind} (${mimeType}) with ${structuredMetadata.wordCount} words across ${structuredMetadata.lineCount} lines.`
            : `Detected as ${kind} (${mimeType}).`,
      contentHash,
      textPreview: structuredMetadata?.preview,
      lineCount: structuredMetadata?.lineCount,
      wordCount: structuredMetadata?.wordCount,
      width: imageDimensions?.width,
      height: imageDimensions?.height,
      pageCount: structuredMetadata?.pageCount,
      title: structuredMetadata?.title,
      author: structuredMetadata?.author,
      durationMs: audioMetadata?.durationMs,
      transcriptPath: sidecars.transcriptPath,
      transcriptPreview: sidecars.transcriptPreview,
      captionPath: sidecars.captionPath,
      captionPreview: sidecars.captionPreview,
    };
  }

  bundle(path: string): MediaBundle {
    const inspection = this.inspect(path);
    const stamp = Date.now();
    const slug = slugifyPath(path);
    const manifestPath = join(this.outputDir, `media-${stamp}-${slug}.json`);
    const reportPath = join(this.outputDir, `media-${stamp}-${slug}.md`);
    const relatedFiles = this.relatedFiles(inspection.path);
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          inspection,
          relatedFiles,
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      reportPath,
      [
        `# Media Bundle`,
        "",
        `Path: ${inspection.path}`,
        `Kind: ${inspection.kind}`,
        `MIME: ${inspection.mimeType}`,
        `Exists: ${inspection.exists}`,
        `Size: ${inspection.sizeBytes}`,
        ...(inspection.width && inspection.height
          ? [`Dimensions: ${inspection.width}x${inspection.height}`]
          : []),
        ...(inspection.durationMs
          ? [`Duration: ${Math.round(inspection.durationMs / 1000)}s`]
          : []),
        ...(inspection.title ? [`Title: ${inspection.title}`] : []),
        ...(inspection.author ? [`Author: ${inspection.author}`] : []),
        ...(inspection.pageCount ? [`Pages: ${inspection.pageCount}`] : []),
        "",
        "## Sidecars",
        `- Transcript: ${inspection.transcriptPath ?? "none"}`,
        `- Caption: ${inspection.captionPath ?? "none"}`,
        "",
        "## Related Files",
        ...(relatedFiles.length
          ? relatedFiles.map((entry) => `- ${entry}`)
          : ["- none"]),
        "",
        "## Preview",
        inspection.transcriptPreview ??
          inspection.captionPreview ??
          inspection.textPreview ??
          inspection.detail,
      ].join("\n"),
      "utf8",
    );

    return {
      inspection,
      manifestPath,
      reportPath,
      relatedFiles,
    };
  }

  analyze(
    path: string,
    focus: "auto" | "voice" | "vision" | "research" = "auto",
  ): MediaAnalysisBundle {
    const inspection = this.inspect(path);
    const bundle = this.bundle(path);
    const inferredFocus =
      focus === "auto"
        ? inspection.kind === "audio" || inspection.kind === "video"
          ? "voice"
          : inspection.kind === "image"
            ? "vision"
            : "research"
        : focus;

    return {
      focus: inferredFocus,
      inspection,
      bundle,
      prompt: this.buildAnalysisPrompt(inspection, bundle, inferredFocus),
      signals: this.buildSignals(inspection),
    };
  }

  voice(path: string): MediaAnalysisBundle {
    return this.analyze(path, "voice");
  }

  vision(path: string): MediaAnalysisBundle {
    return this.analyze(path, "vision");
  }

  async analyzeWithModel(
    path: string,
    focus: "auto" | "voice" | "vision" | "research" = "auto",
  ): Promise<MediaModelAnalysisBundle> {
    const analysis = this.analyze(path, focus);
    const modelContext = this.getModelContext?.();
    const stamp = Date.now();
    const slug = this.slugifyText(
      `${analysis.focus}-${analysis.inspection.basename}-${analysis.inspection.contentHash ?? "analysis"}`,
    );
    const manifestPath = join(
      this.outputDir,
      `media-${stamp}-${slug}-analysis.json`,
    );
    const reportPath = join(
      this.outputDir,
      `media-${stamp}-${slug}-analysis.md`,
    );
    const responsePath = join(
      this.outputDir,
      `media-${stamp}-${slug}-analysis-response.md`,
    );
    const response = await this.requestModelText(
      analysis.prompt,
      modelContext,
      {
        focus: analysis.focus,
        inspection: analysis.inspection,
        signals: analysis.signals,
      },
    );

    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          createdAt: nowIso(),
          analysis,
          response,
          provider: modelContext?.provider ?? "offline",
          model: modelContext?.model ?? "offline",
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      reportPath,
      [
        `# Media Analysis: ${analysis.inspection.basename}`,
        "",
        `- Focus: ${analysis.focus}`,
        `- Provider: ${modelContext?.provider ?? "offline"}`,
        `- Model: ${modelContext?.model ?? "offline"}`,
        `- Bundle manifest: ${analysis.bundle.manifestPath}`,
        `- Bundle report: ${analysis.bundle.reportPath}`,
        "",
        "## Signals",
        ...(analysis.signals.length
          ? analysis.signals.map((signal) => `- ${signal}`)
          : ["- none"]),
        "",
        "## Prompt",
        analysis.prompt,
        "",
        "## Response",
        response,
      ].join("\n"),
      "utf8",
    );

    writeFileSync(responsePath, response, "utf8");

    return {
      analysis,
      response,
      responsePath,
      reportPath,
      manifestPath,
      model: modelContext?.model ?? "offline",
      provider: modelContext?.provider ?? "offline",
    };
  }

  async voiceWithModel(path: string): Promise<MediaModelAnalysisBundle> {
    return this.analyzeWithModel(path, "voice");
  }

  async visionWithModel(path: string): Promise<MediaModelAnalysisBundle> {
    return this.analyzeWithModel(path, "vision");
  }

  async transcribe(
    path: string,
    options: {
      language?: string;
      prompt?: string;
      name?: string;
    } = {},
  ): Promise<MediaTranscriptionBundle> {
    const inspection = this.inspect(path);
    const bundle = this.bundle(path);
    const modelContext = this.getModelContext?.();
    const stamp = Date.now();
    const label = this.slugifyText(
      options.name ??
        `${inspection.basename}-${inspection.contentHash ?? "transcript"}`,
    );
    const promptPath = join(
      this.outputDir,
      `media-${stamp}-${label}-transcription-prompt.md`,
    );
    const manifestPath = join(
      this.outputDir,
      `media-${stamp}-${label}-transcription.json`,
    );
    const reportPath = join(
      this.outputDir,
      `media-${stamp}-${label}-transcription.md`,
    );
    const transcriptPath = join(
      this.outputDir,
      `media-${stamp}-${label}-transcript.txt`,
    );
    const responsePath = join(
      this.outputDir,
      `media-${stamp}-${label}-transcription-response.txt`,
    );
    const prompt = [
      "Create a concise Eliza Agent transcript or spoken-content summary for the attached media.",
      "Prefer exact transcription when the provider supports it; otherwise return a best-effort plain-text transcript.",
      "Keep the output readable and free of filler.",
      "",
      `Path: ${inspection.path}`,
      `Kind: ${inspection.kind}`,
      `MIME: ${inspection.mimeType}`,
      `Duration: ${inspection.durationMs ? `${Math.round(inspection.durationMs / 1000)}s` : "unknown"}`,
      inspection.transcriptPreview
        ? `Existing transcript sidecar preview: ${inspection.transcriptPreview}`
        : undefined,
      inspection.captionPreview
        ? `Existing caption sidecar preview: ${inspection.captionPreview}`
        : undefined,
      "",
      "Signals:",
      ...this.buildSignals(inspection).map((signal) => `- ${signal}`),
    ]
      .filter(Boolean)
      .join("\n");
    let transcriptText = "";
    let response = "";
    let source: MediaTranscriptionBundle["source"] = "offline";

    if (
      modelContext?.provider === "openai" &&
      modelContext.openAiApiKey &&
      inspection.exists &&
      !inspection.isDirectory
    ) {
      try {
        const fileBytes = readFileSync(inspection.path);
        const form = new FormData();
        form.append("model", modelContext.model);
        form.append(
          "file",
          new Blob([fileBytes], {
            type: inspection.mimeType || "application/octet-stream",
          }),
          inspection.basename,
        );
        if (options.language) {
          form.append("language", options.language);
        }
        form.append("prompt", options.prompt ?? prompt);
        const transcriptionResponse = await fetch(
          `${modelContext.baseUrl}/audio/transcriptions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${modelContext.openAiApiKey}`,
            },
            body: form,
          },
        );

        if (!transcriptionResponse.ok) {
          const body = await transcriptionResponse.text();
          throw new Error(
            `OpenAI transcription failed (${transcriptionResponse.status}): ${body}`,
          );
        }

        const data = (await transcriptionResponse.json()) as {
          text?: string;
        };
        transcriptText = data.text?.trim() ?? "";
        response = transcriptText;
        source = "openai";
      } catch (error) {
        response = error instanceof Error ? error.message : String(error);
      }
    }

    if (
      !transcriptText &&
      inspection.transcriptPath &&
      existsSync(inspection.transcriptPath)
    ) {
      transcriptText = readFileSync(inspection.transcriptPath, "utf8").trim();
      source = "sidecar";
      response = `Used existing transcript sidecar at ${inspection.transcriptPath}.`;
    }

    if (
      !transcriptText &&
      modelContext?.provider === "anthropic" &&
      modelContext.anthropicApiKey
    ) {
      try {
        transcriptText = await this.requestModelText(prompt, modelContext, {
          focus: "voice",
          inspection,
          signals: this.buildSignals(inspection),
        });
        source = "anthropic";
        response =
          "Generated a best-effort provider-backed transcript summary.";
      } catch (error) {
        response = error instanceof Error ? error.message : String(error);
      }
    }

    if (!transcriptText) {
      transcriptText = [
        `Eliza Agent offline transcript for ${inspection.basename}.`,
        inspection.transcriptPreview
          ? `Transcript sidecar preview: ${inspection.transcriptPreview}`
          : undefined,
        inspection.captionPreview
          ? `Caption sidecar preview: ${inspection.captionPreview}`
          : undefined,
        inspection.detail,
      ]
        .filter(Boolean)
        .join("\n");
      response = "Generated an offline transcript fallback.";
    }

    writeFileSync(transcriptPath, `${transcriptText.trim()}\n`, "utf8");
    writeFileSync(
      promptPath,
      [
        `# Transcription Prompt`,
        "",
        `Source path: ${inspection.path}`,
        `Provider: ${modelContext?.provider ?? "offline"}`,
        `Model: ${modelContext?.model ?? "offline"}`,
        `Source: ${source}`,
        "",
        prompt,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          createdAt: nowIso(),
          inspection,
          bundle,
          prompt,
          transcriptText,
          transcriptPath,
          provider: modelContext?.provider ?? "offline",
          model: modelContext?.model ?? "offline",
          source,
          response,
        },
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(
      reportPath,
      [
        `# Transcription: ${inspection.basename}`,
        "",
        `- Provider: ${modelContext?.provider ?? "offline"}`,
        `- Model: ${modelContext?.model ?? "offline"}`,
        `- Source: ${source}`,
        `- Bundle manifest: ${bundle.manifestPath}`,
        `- Transcript artifact: ${transcriptPath}`,
        "",
        "## Transcript",
        transcriptText,
        "",
        "## Prompt",
        prompt,
        "",
        "## Response",
        response,
      ].join("\n"),
      "utf8",
    );

    return {
      inspection,
      bundle,
      prompt,
      transcriptText,
      transcriptPath,
      promptPath,
      manifestPath,
      reportPath,
      responsePath,
      response,
      model: modelContext?.model ?? "offline",
      provider: modelContext?.provider ?? "offline",
      source,
    };
  }

  async transcribeWithModel(
    path: string,
    options: {
      language?: string;
      prompt?: string;
      name?: string;
    } = {},
  ): Promise<MediaTranscriptionBundle> {
    return this.transcribe(path, options);
  }

  async generateImage(
    prompt: string,
    options: {
      name?: string;
      size?: string;
      style?: string;
      focus?: string;
    } = {},
  ): Promise<MediaGenerationBundle> {
    const modelContext = this.getModelContext?.();
    const stamp = Date.now();
    const label = this.slugifyText(options.name ?? prompt);
    const promptPath = join(
      this.outputDir,
      `media-${stamp}-${label}-prompt.md`,
    );
    const manifestPath = join(
      this.outputDir,
      `media-${stamp}-${label}-generation.json`,
    );
    const reportPath = join(
      this.outputDir,
      `media-${stamp}-${label}-generation.md`,
    );
    const refinedPrompt = await this.requestModelText(
      [
        "Create a concise image-generation brief for Eliza Agent.",
        "Return a compact prompt that captures subject, style, composition, and palette.",
        `Source prompt: ${prompt}`,
        options.style ? `Style: ${options.style}` : undefined,
        options.focus ? `Focus: ${options.focus}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      modelContext,
      {
        focus: "vision",
      },
    );
    const generation = await this.requestImageGeneration(
      refinedPrompt || prompt,
      modelContext,
      {
        size: options.size,
      },
    );
    const artifactPath =
      generation?.path ?? join(this.outputDir, `media-${stamp}-${label}.svg`);
    const artifactKind = generation?.kind ?? "svg";
    const response = generation?.response;
    const responsePath = generation?.responsePath;

    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          createdAt: nowIso(),
          prompt,
          refinedPrompt,
          options,
          provider: modelContext?.provider ?? "offline",
          model:
            modelContext?.openAiImageModel ?? modelContext?.model ?? "offline",
          artifactPath,
          artifactKind,
          responsePath,
        },
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      promptPath,
      [
        `# Image Prompt`,
        "",
        `Original prompt: ${prompt}`,
        options.style ? `Style: ${options.style}` : undefined,
        options.focus ? `Focus: ${options.focus}` : undefined,
        "",
        "## Refined Prompt",
        refinedPrompt || prompt,
      ]
        .filter(Boolean)
        .join("\n"),
      "utf8",
    );

    writeFileSync(
      reportPath,
      [
        `# Image Generation`,
        "",
        `- Provider: ${modelContext?.provider ?? "offline"}`,
        `- Model: ${modelContext?.openAiImageModel ?? modelContext?.model ?? "offline"}`,
        `- Artifact: ${artifactPath}`,
        `- Kind: ${artifactKind}`,
        "",
        "## Original Prompt",
        prompt,
        "",
        "## Refined Prompt",
        refinedPrompt || prompt,
        "",
        response ? "## Model Response" : "## Mode",
        response ?? "Generated locally as an SVG concept artifact.",
      ].join("\n"),
      "utf8",
    );

    return {
      prompt,
      refinedPrompt: refinedPrompt || prompt,
      promptPath,
      manifestPath,
      reportPath,
      artifactPath,
      artifactKind,
      response,
      responsePath,
      model: modelContext?.openAiImageModel ?? modelContext?.model,
      provider: modelContext?.provider,
    };
  }

  async speak(
    text: string,
    options: {
      name?: string;
      voice?: string;
      format?: "mp3" | "svg";
      speed?: number;
    } = {},
  ): Promise<MediaSpeechBundle> {
    const modelContext = this.getModelContext?.();
    const stamp = Date.now();
    const label = this.slugifyText(options.name ?? text);
    const promptPath = join(
      this.outputDir,
      `media-${stamp}-${label}-speech-prompt.md`,
    );
    const manifestPath = join(
      this.outputDir,
      `media-${stamp}-${label}-speech.json`,
    );
    const reportPath = join(
      this.outputDir,
      `media-${stamp}-${label}-speech.md`,
    );
    const voice = options.voice ?? "alloy";
    let refinedText = text;
    try {
      refinedText = await this.requestModelText(
        [
          "Rewrite the following text into a concise, speakable Eliza Agent narration.",
          "Keep the Eliza branding intact and remove unnecessary filler.",
          `Voice: ${voice}`,
          options.speed ? `Speed: ${options.speed}` : undefined,
          "",
          text,
        ]
          .filter(Boolean)
          .join("\n"),
        modelContext,
        {
          focus: "voice",
        },
      );
    } catch {
      refinedText = text;
    }
    const script = refinedText || text;
    const responsePath = join(
      this.outputDir,
      `media-${stamp}-${label}-speech-response.txt`,
    );
    let artifactPath = join(
      this.outputDir,
      `media-${stamp}-${label}-speech.svg`,
    );
    let artifactKind: "mp3" | "svg" = "svg";
    let response = "Generated an offline Eliza Agent speech concept artifact.";
    const preferredFormat = options.format ?? "mp3";

    if (preferredFormat !== "svg" && modelContext?.falApiKey) {
      try {
        const tts = await this.generateFalSpeech(script, {
          apiKey: modelContext.falApiKey,
          voice: this.resolveFalVoice(voice),
        });
        const audioResponse = await fetch(tts.audioUrl);
        if (!audioResponse.ok) {
          const body = await audioResponse.text();
          throw new Error(
            `Official TTS artifact download failed (${audioResponse.status}): ${body}`,
          );
        }

        const bytes = Buffer.from(await audioResponse.arrayBuffer());
        artifactPath = join(
          this.outputDir,
          `media-${stamp}-${label}-speech.mp3`,
        );
        artifactKind = "mp3";
        writeFileSync(artifactPath, bytes);
        response = `Generated official TTS plugin-compatible speech audio at ${artifactPath}.`;
      } catch (error) {
        response = error instanceof Error ? error.message : String(error);
      }
    }

    if (
      artifactKind !== "mp3" &&
      preferredFormat !== "svg" &&
      modelContext?.provider === "openai" &&
      modelContext.openAiApiKey
    ) {
      try {
        const synthResponse = await fetch(
          `${modelContext.baseUrl}/audio/speech`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${modelContext.openAiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: modelContext.model,
              input: script,
              voice,
              response_format: "mp3",
              speed: options.speed,
            }),
          },
        );

        if (!synthResponse.ok) {
          const body = await synthResponse.text();
          throw new Error(
            `OpenAI speech synthesis failed (${synthResponse.status}): ${body}`,
          );
        }

        const bytes = Buffer.from(await synthResponse.arrayBuffer());
        artifactPath = join(
          this.outputDir,
          `media-${stamp}-${label}-speech.mp3`,
        );
        artifactKind = "mp3";
        writeFileSync(artifactPath, bytes);
        response = `Generated provider-native speech audio at ${artifactPath}.`;
      } catch (error) {
        response = error instanceof Error ? error.message : String(error);
        artifactPath = join(
          this.outputDir,
          `media-${stamp}-${label}-speech.svg`,
        );
        artifactKind = "svg";
        writeFileSync(
          artifactPath,
          this.renderSpeechSvg(script, voice, options.speed),
          "utf8",
        );
      }
    }

    if (artifactKind !== "mp3") {
      writeFileSync(
        artifactPath,
        this.renderSpeechSvg(script, voice, options.speed),
        "utf8",
      );
    }

    writeFileSync(
      promptPath,
      [
        `# Speech Prompt`,
        "",
        `Provider: ${modelContext?.provider ?? "offline"}`,
        `Model: ${modelContext?.model ?? "offline"}`,
        `Voice: ${voice}`,
        options.speed ? `Speed: ${options.speed}` : undefined,
        "",
        text,
      ]
        .filter(Boolean)
        .join("\n"),
      "utf8",
    );
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          createdAt: nowIso(),
          prompt: text,
          refinedText,
          script,
          voice,
          speed: options.speed,
          provider: modelContext?.provider ?? "offline",
          model: modelContext?.model ?? "offline",
          artifactPath,
          artifactKind,
          responsePath,
        },
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(
      reportPath,
      [
        `# Speech Generation`,
        "",
        `- Provider: ${modelContext?.provider ?? "offline"}`,
        `- Model: ${modelContext?.model ?? "offline"}`,
        `- Voice: ${voice}`,
        `- Artifact: ${artifactPath}`,
        `- Kind: ${artifactKind}`,
        "",
        "## Source Text",
        text,
        "",
        "## Refined Narration",
        script,
        "",
        "## Response",
        response,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(responsePath, response, "utf8");

    return {
      prompt: text,
      refinedText: script,
      promptPath,
      manifestPath,
      reportPath,
      artifactPath,
      artifactKind,
      response,
      responsePath,
      model: modelContext?.model ?? "offline",
      provider: modelContext?.provider ?? "offline",
      voice,
    };
  }

  async speakWithModel(
    text: string,
    options: {
      name?: string;
      voice?: string;
      format?: "mp3" | "svg";
      speed?: number;
    } = {},
  ): Promise<MediaSpeechBundle> {
    return this.speak(text, options);
  }

  private detectKind(
    extension: string,
  ): "image" | "audio" | "video" | "document" | "unknown" {
    if (
      [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(extension)
    ) {
      return "image";
    }
    if ([".mp3", ".wav", ".m4a", ".ogg"].includes(extension)) {
      return "audio";
    }
    if ([".mp4", ".mov", ".webm", ".avi"].includes(extension)) {
      return "video";
    }
    if (
      [
        ".pdf",
        ".txt",
        ".md",
        ".json",
        ".csv",
        ".html",
        ".htm",
        ".yaml",
        ".yml",
        ".toml",
        ".xml",
      ].includes(extension)
    ) {
      return "document";
    }
    return "unknown";
  }

  private resolveFalVoice(voice?: string): string {
    if (!voice || voice === "alloy") {
      return "Jennifer (English (US)/American)";
    }
    return voice;
  }

  private async generateFalSpeech(
    text: string,
    options: {
      apiKey: string;
      voice: string;
    },
  ): Promise<{ audioUrl: string }> {
    fal.config({
      credentials: options.apiKey,
    });
    const response = (await fal.subscribe("fal-ai/playai/tts/v3", {
      input: {
        input: text,
        voice: options.voice,
      },
      logs: false,
    })) as {
      data?: {
        audio?: {
          url?: string;
        };
      };
    };
    const audioUrl = response.data?.audio?.url;
    if (!audioUrl) {
      throw new Error(
        "Official TTS plugin did not return an audio artifact URL.",
      );
    }
    return {
      audioUrl,
    };
  }

  private readImageDimensions(
    path: string,
    extension: string,
  ): { width: number; height: number } | undefined {
    const bytes = readFileSync(path);

    if (extension === ".png" && bytes.length >= 24) {
      return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
      };
    }

    if ((extension === ".gif" || extension === ".webp") && bytes.length >= 10) {
      if (extension === ".gif") {
        return {
          width: bytes.readUInt16LE(6),
          height: bytes.readUInt16LE(8),
        };
      }
      if (
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP"
      ) {
        const chunkType = bytes.subarray(12, 16).toString("ascii");
        if (chunkType === "VP8X" && bytes.length >= 30) {
          return {
            width: 1 + bytes.readUIntLE(24, 3),
            height: 1 + bytes.readUIntLE(27, 3),
          };
        }
      }
    }

    if (extension === ".jpg" || extension === ".jpeg") {
      return this.readJpegDimensions(bytes);
    }

    if (extension === ".svg") {
      const text = bytes.toString("utf8");
      const widthMatch = text.match(/\bwidth="([\d.]+)(px)?"/iu);
      const heightMatch = text.match(/\bheight="([\d.]+)(px)?"/iu);
      const viewBoxMatch = text.match(/\bviewBox="([\d.\s-]+)"/iu);
      if (widthMatch && heightMatch) {
        return {
          width: Number(widthMatch[1]),
          height: Number(heightMatch[1]),
        };
      }
      if (viewBoxMatch) {
        const parts = viewBoxMatch[1]
          .split(/\s+/u)
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));
        if (parts.length === 4) {
          return {
            width: parts[2],
            height: parts[3],
          };
        }
      }
    }

    return undefined;
  }

  private readJpegDimensions(
    bytes: Buffer,
  ): { width: number; height: number } | undefined {
    if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) {
      return undefined;
    }

    let offset = 2;
    while (offset + 1 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = bytes[offset + 1];
      if (marker === 0xd9 || marker === 0xda) {
        break;
      }

      if (offset + 3 >= bytes.length) {
        break;
      }

      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) {
        break;
      }

      const sofMarkers = new Set([
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb,
      ]);
      if (sofMarkers.has(marker) && offset + 9 < bytes.length) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }

      offset += 2 + length;
    }

    return undefined;
  }

  private readTextMetadata(
    path: string,
    extension: string,
  ):
    | {
        preview: string;
        lineCount: number;
        wordCount: number;
        pageCount?: number;
        title?: string;
        author?: string;
      }
    | undefined {
    if (
      ![
        ".txt",
        ".md",
        ".json",
        ".csv",
        ".html",
        ".htm",
        ".yaml",
        ".yml",
        ".toml",
        ".xml",
      ].includes(extension)
    ) {
      return undefined;
    }

    const content = readFileSync(path, "utf8");
    const preview = this.buildPreview(content, extension);
    const lineCount = content ? content.split(/\r?\n/u).length : 0;
    const wordCount = content
      ? content.split(/\s+/u).filter(Boolean).length
      : 0;
    return {
      preview,
      lineCount,
      wordCount,
    };
  }

  private readPdfMetadata(path: string):
    | {
        preview: string;
        lineCount?: number;
        wordCount?: number;
        pageCount?: number;
        title?: string;
        author?: string;
      }
    | undefined {
    const bytes = readFileSync(path);
    if (bytes.subarray(0, 4).toString("ascii") !== "%PDF") {
      return undefined;
    }

    const text = bytes.toString("latin1", 0, Math.min(bytes.length, 64_000));
    const title = text.match(/\/Title\s*\(([^)]{1,200})\)/iu)?.[1];
    const author = text.match(/\/Author\s*\(([^)]{1,200})\)/iu)?.[1];
    const pageCount =
      (text.match(/\/Type\s*\/Page\b/gu) ?? []).length || undefined;
    const preview = text
      .replace(/[^\t\n\r -~]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 512);

    return {
      preview,
      pageCount,
      title,
      author,
    };
  }

  private readAudioMetadata(
    path: string,
    extension: string,
  ): { durationMs?: number } | undefined {
    const bytes = readFileSync(path);

    if (extension === ".wav" && bytes.length >= 44) {
      const riff = bytes.subarray(0, 4).toString("ascii");
      const wave = bytes.subarray(8, 12).toString("ascii");
      if (riff === "RIFF" && wave === "WAVE") {
        const byteRate = bytes.readUInt32LE(28);
        const dataSize = bytes.readUInt32LE(40);
        if (byteRate > 0 && dataSize >= 0) {
          return {
            durationMs: Math.round((dataSize / byteRate) * 1000),
          };
        }
      }
    }

    return undefined;
  }

  private readSidecars(
    resolvedPath: string,
    kind: MediaInspection["kind"],
  ): {
    transcriptPath?: string;
    transcriptPreview?: string;
    captionPath?: string;
    captionPreview?: string;
  } {
    const extension = extname(resolvedPath);
    const basePath = resolvedPath.slice(
      0,
      resolvedPath.length - extension.length,
    );
    const transcriptCandidates =
      kind === "audio" || kind === "video"
        ? [
            `${basePath}.txt`,
            `${basePath}.md`,
            `${basePath}.transcript.txt`,
            `${basePath}.srt`,
            `${basePath}.vtt`,
          ]
        : [];
    const captionCandidates =
      kind === "image"
        ? [
            `${basePath}.txt`,
            `${basePath}.md`,
            `${basePath}.caption.txt`,
            `${basePath}.alt.txt`,
          ]
        : [];

    const transcriptPath = transcriptCandidates.find((candidate) =>
      existsSync(candidate),
    );
    const captionPath = captionCandidates.find((candidate) =>
      existsSync(candidate),
    );

    return {
      transcriptPath,
      transcriptPreview: transcriptPath
        ? this.readSidecarPreview(transcriptPath)
        : undefined,
      captionPath,
      captionPreview: captionPath
        ? this.readSidecarPreview(captionPath)
        : undefined,
    };
  }

  private readSidecarPreview(path: string): string {
    return this.buildPreview(
      readFileSync(path, "utf8"),
      extname(path).toLowerCase(),
    );
  }

  private relatedFiles(resolvedPath: string): string[] {
    const extension = extname(resolvedPath);
    const basePath = resolvedPath.slice(
      0,
      resolvedPath.length - extension.length,
    );
    const candidates = [
      `${basePath}.txt`,
      `${basePath}.md`,
      `${basePath}.caption.txt`,
      `${basePath}.alt.txt`,
      `${basePath}.transcript.txt`,
      `${basePath}.srt`,
      `${basePath}.vtt`,
    ];
    return candidates.filter(
      (candidate) => candidate !== resolvedPath && existsSync(candidate),
    );
  }

  private buildPreview(content: string, extension: string): string {
    const trimmed = content.trim();
    if (!trimmed) {
      return "";
    }

    if (extension === ".html" || extension === ".htm") {
      const text = trimmed
        .replace(/<script[\s\S]*?<\/script>/giu, " ")
        .replace(/<style[\s\S]*?<\/style>/giu, " ")
        .replace(/<[^>]+>/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
      return text.slice(0, 512);
    }

    if (extension === ".csv") {
      const [header, ...rows] = trimmed.split(/\r?\n/u);
      const sample = [header, ...rows.slice(0, 2)].join("\n");
      return sample.slice(0, 512);
    }

    if (
      extension === ".yaml" ||
      extension === ".yml" ||
      extension === ".toml" ||
      extension === ".xml"
    ) {
      return trimmed.slice(0, 512);
    }

    return trimmed.slice(0, 512);
  }

  private buildSignals(inspection: MediaInspection): string[] {
    return [
      `Kind: ${inspection.kind}`,
      `MIME: ${inspection.mimeType}`,
      `Exists: ${inspection.exists}`,
      `Size: ${inspection.sizeBytes}`,
      inspection.width && inspection.height
        ? `Dimensions: ${inspection.width}x${inspection.height}`
        : undefined,
      inspection.durationMs
        ? `Duration: ${Math.round(inspection.durationMs / 1000)}s`
        : undefined,
      inspection.pageCount ? `Pages: ${inspection.pageCount}` : undefined,
      inspection.title ? `Title: ${inspection.title}` : undefined,
      inspection.author ? `Author: ${inspection.author}` : undefined,
      inspection.transcriptPath
        ? `Transcript: ${inspection.transcriptPath}`
        : undefined,
      inspection.captionPath ? `Caption: ${inspection.captionPath}` : undefined,
    ].filter(Boolean) as string[];
  }

  private buildAnalysisPrompt(
    inspection: MediaInspection,
    bundle: MediaBundle,
    focus: "voice" | "vision" | "research",
  ): string {
    const kindLabel =
      focus === "voice"
        ? "voice or audio"
        : focus === "vision"
          ? "vision or image"
          : "research";
    const contentPreview =
      inspection.transcriptPreview ??
      inspection.captionPreview ??
      inspection.textPreview ??
      inspection.detail;

    return [
      `You are reviewing a ${kindLabel} artifact for Eliza Agent and should provide concise, actionable analysis.`,
      `Focus on the content's meaning, any missing context, and useful downstream actions.`,
      `Keep the response short and structured: summary, signals, recommendations.`,
      "",
      `Path: ${inspection.path}`,
      `Kind: ${inspection.kind}`,
      `MIME: ${inspection.mimeType}`,
      `Exists: ${inspection.exists}`,
      `Size bytes: ${inspection.sizeBytes}`,
      inspection.width && inspection.height
        ? `Dimensions: ${inspection.width}x${inspection.height}`
        : undefined,
      inspection.durationMs
        ? `Duration: ${Math.round(inspection.durationMs / 1000)}s`
        : undefined,
      inspection.pageCount ? `Pages: ${inspection.pageCount}` : undefined,
      inspection.title ? `Title: ${inspection.title}` : undefined,
      inspection.author ? `Author: ${inspection.author}` : undefined,
      inspection.transcriptPath
        ? `Transcript sidecar: ${inspection.transcriptPath}`
        : undefined,
      inspection.captionPath
        ? `Caption sidecar: ${inspection.captionPath}`
        : undefined,
      "",
      "Signals:",
      ...this.buildSignals(inspection).map((signal) => `- ${signal}`),
      "",
      "Bundle artifacts:",
      `- Manifest: ${bundle.manifestPath}`,
      `- Report: ${bundle.reportPath}`,
      "",
      "Related files:",
      ...(bundle.relatedFiles.length
        ? bundle.relatedFiles.map((entry) => `- ${entry}`)
        : ["- none"]),
      "",
      "Preview:",
      contentPreview.slice(0, 2400) || "(empty)",
    ]
      .filter((line) => line !== undefined)
      .join("\n");
  }

  private async requestModelText(
    prompt: string,
    context: MediaModelContext | undefined,
    metadata: {
      focus: string;
      inspection?: MediaInspection;
      signals?: string[];
    },
  ): Promise<string> {
    const canUseOpenAi = Boolean(context?.openAiApiKey);
    const canUseAnthropic = Boolean(context?.anthropicApiKey);

    if (
      !context ||
      context.provider === "offline" ||
      (!canUseOpenAi && !canUseAnthropic)
    ) {
      return [
        `Offline analysis for ${metadata.focus}.`,
        metadata.inspection ? `Kind: ${metadata.inspection.kind}` : undefined,
        metadata.inspection?.textPreview
          ? `Preview: ${metadata.inspection.textPreview}`
          : undefined,
        metadata.inspection?.transcriptPreview
          ? `Transcript: ${metadata.inspection.transcriptPreview}`
          : undefined,
        metadata.inspection?.captionPreview
          ? `Caption: ${metadata.inspection.captionPreview}`
          : undefined,
        ...(metadata.signals?.length
          ? [`Signals: ${metadata.signals.join("; ")}`]
          : []),
        "",
        prompt.slice(0, 1200),
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (
      (context.provider === "anthropic" && canUseAnthropic) ||
      (!canUseOpenAi && canUseAnthropic)
    ) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      };
      if (context.anthropicApiKey) {
        headers["x-api-key"] = context.anthropicApiKey;
      }
      const response = await fetch(
        `${context.anthropicBaseUrl ?? context.baseUrl}/messages`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: context.model,
            max_tokens: context.maxTokens,
            temperature: context.temperature,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Anthropic request failed (${response.status}): ${body}`,
        );
      }

      const data = (await response.json()) as {
        content?: Array<{ text?: string }>;
      };
      return (
        data.content
          ?.map((entry) => entry.text ?? "")
          .join("")
          .trim() || "No response returned."
      );
    }

    if (!canUseOpenAi) {
      return prompt.slice(0, 1200);
    }

    const response = await fetch(`${context.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: context.model,
        temperature: context.temperature,
        max_tokens: context.maxTokens,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI-compatible request failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return (
      data.choices?.[0]?.message?.content?.trim() ?? "No response returned."
    );
  }

  private async requestImageGeneration(
    prompt: string,
    context: MediaModelContext | undefined,
    options: { size?: string },
  ): Promise<
    | {
        path: string;
        responsePath?: string;
        response?: string;
        kind: "png" | "svg";
      }
    | undefined
  > {
    const fallbackPath = join(
      this.outputDir,
      `media-${Date.now()}-${this.slugifyText(prompt)}.svg`,
    );
    if (!context || !context.openAiApiKey) {
      writeFileSync(
        fallbackPath,
        this.renderGenerationSvg(prompt, options.size ?? "1024x1024"),
        "utf8",
      );
      return {
        path: fallbackPath,
        kind: "svg",
      };
    }

    const imageModel = context.openAiImageModel ?? context.model;
    const response = await fetch(`${context.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: imageModel,
        prompt,
        size: options.size ?? "1024x1024",
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Image generation failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const generated = data.data?.[0];
    if (!generated) {
      return undefined;
    }

    if (generated.b64_json) {
      const path = join(
        this.outputDir,
        `media-${Date.now()}-${this.slugifyText(prompt)}.png`,
      );
      writeFileSync(path, Buffer.from(generated.b64_json, "base64"));
      return {
        path,
        kind: "png",
      };
    }

    if (generated.url) {
      const path = fallbackPath;
      writeFileSync(
        path,
        this.renderGenerationSvg(prompt, options.size ?? "1024x1024", [
          `Generated image URL: ${generated.url}`,
        ]),
        "utf8",
      );
      const responsePath = join(
        this.outputDir,
        `media-${Date.now()}-${this.slugifyText(prompt)}.json`,
      );
      writeFileSync(
        responsePath,
        JSON.stringify(
          {
            prompt,
            url: generated.url,
          },
          null,
          2,
        ),
        "utf8",
      );
      return {
        path,
        kind: "svg",
        response: generated.url,
        responsePath,
      };
    }

    writeFileSync(
      fallbackPath,
      this.renderGenerationSvg(prompt, options.size ?? "1024x1024"),
      "utf8",
    );
    return {
      path: fallbackPath,
      kind: "svg",
    };
  }

  private renderGenerationSvg(
    prompt: string,
    size: string,
    notes: string[] = [],
  ): string {
    const excerpt = prompt.replace(/\s+/gu, " ").slice(0, 220);
    const width = 1200;
    const height = 700;
    const lines = [
      "Eliza Agent Image Concept",
      `Prompt: ${excerpt}`,
      `Size: ${size}`,
      ...(notes.length
        ? notes
        : [
            "Generated from the configured image pipeline or offline fallback.",
          ]),
    ];
    const rows = lines
      .map(
        (line, index) =>
          `<text x="32" y="${80 + index * 42}" fill="#e5eefc" font-family="ui-monospace, SFMono-Regular, monospace" font-size="20">${this.escapeXml(line)}</text>`,
      )
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="24" fill="rgba(15, 23, 42, 0.72)" stroke="#60a5fa" stroke-width="2"/>
  <text x="32" y="52" fill="#93c5fd" font-family="ui-sans-serif, system-ui, sans-serif" font-size="24" font-weight="700">Eliza Agent Browserless Image Concept</text>
  ${rows}
</svg>`;
  }

  private renderSpeechSvg(text: string, voice: string, speed?: number): string {
    const excerpt = text.replace(/\s+/gu, " ").slice(0, 220);
    const rows = [
      `Voice: ${voice}`,
      speed ? `Speed: ${speed}` : "Speed: default",
      `Narration: ${excerpt}`,
      "Generated from the configured speech pipeline or offline fallback.",
    ]
      .map(
        (line, index) =>
          `<text x="32" y="${90 + index * 44}" fill="#e5eefc" font-family="ui-monospace, SFMono-Regular, monospace" font-size="20">${this.escapeXml(line)}</text>`,
      )
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#081120"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="700" fill="url(#bg)"/>
  <rect x="24" y="24" width="1152" height="652" rx="24" fill="rgba(15, 23, 42, 0.76)" stroke="#7dd3fc" stroke-width="2"/>
  <text x="32" y="52" fill="#93c5fd" font-family="ui-sans-serif, system-ui, sans-serif" font-size="24" font-weight="700">Eliza Agent Speech Concept</text>
  ${rows}
</svg>`;
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  private slugifyText(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "media"
    );
  }

  private hashFile(path: string): string {
    const bytes = readFileSync(path);
    return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  }
}

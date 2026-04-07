import type { ToolDefinition } from "@/types";

export const TOOL_DOCUMENT_CATALOG = [
  {
    id: "documents.pdf.extract",
    name: "PDF Extract",
    category: "documents",
    description: "Extract text from PDF files through the PDF service.",
    enabled: true,
    transport: "service",
  },
  {
    id: "web.fetch",
    name: "Web Fetch",
    category: "documents",
    description:
      "Fetch and extract readable text from a URL through the configured browser backend.",
    enabled: true,
    transport: "service",
  },
  {
    id: "browser.status",
    name: "Browser Status",
    category: "documents",
    description: "Inspect the configured browser automation backend.",
    enabled: true,
    transport: "service",
  },
  {
    id: "browser.snapshot",
    name: "Browser Snapshot",
    category: "documents",
    description: "Create a text snapshot artifact for a URL.",
    enabled: true,
    transport: "service",
  },
  {
    id: "browser.screenshot",
    name: "Browser Screenshot",
    category: "documents",
    description:
      "Create a lightweight screenshot artifact placeholder for a URL.",
    enabled: true,
    transport: "service",
  },
  {
    id: "browser.capture",
    name: "Browser Capture Bundle",
    category: "documents",
    description:
      "Create a reusable bundle with snapshot, screenshot, report, and manifest artifacts for a URL.",
    enabled: true,
    transport: "service",
  },
  {
    id: "browser.analyze",
    name: "Browser Analyze",
    category: "documents",
    description: "Create a model-backed analysis brief for a browser capture.",
    enabled: true,
    transport: "service",
  },
  {
    id: "browser.compare",
    name: "Browser Compare",
    category: "documents",
    description:
      "Compare two captures and emit a diff-style browser report bundle.",
    enabled: true,
    transport: "service",
  },
  {
    id: "browser.compare.analyze",
    name: "Browser Compare Analyze",
    category: "documents",
    description:
      "Create a model-backed analysis brief for a browser comparison bundle.",
    enabled: true,
    transport: "service",
  },
  {
    id: "media.inspect",
    name: "Media Inspect",
    category: "documents",
    description: "Inspect local media files for type and size metadata.",
    enabled: true,
    transport: "service",
  },
  {
    id: "media.analyze",
    name: "Media Analyze",
    category: "documents",
    description:
      "Create a model-backed analysis brief for audio, image, or document media.",
    enabled: true,
    transport: "service",
  },
  {
    id: "media.voice",
    name: "Media Voice",
    category: "documents",
    description:
      "Create a voice-focused model-backed analysis brief for audio or video media.",
    enabled: true,
    transport: "service",
  },
  {
    id: "media.transcribe",
    name: "Media Transcribe",
    category: "documents",
    description:
      "Create a provider-native transcription or best-effort transcript bundle for audio and video media.",
    enabled: true,
    transport: "service",
  },
  {
    id: "media.speak",
    name: "Media Speak",
    category: "documents",
    description:
      "Generate provider-native Doolittle speech audio or an offline speech concept bundle.",
    enabled: true,
    transport: "service",
  },
  {
    id: "media.vision",
    name: "Media Vision",
    category: "documents",
    description:
      "Create a vision-focused model-backed analysis brief for image media.",
    enabled: true,
    transport: "service",
  },
  {
    id: "media.bundle",
    name: "Media Bundle",
    category: "documents",
    description:
      "Package a media file with its sidecars and extracted metadata into a reusable report bundle.",
    enabled: true,
    transport: "service",
  },
  {
    id: "media.generate",
    name: "Media Generate",
    category: "documents",
    description:
      "Generate a model-assisted image concept artifact from a prompt.",
    enabled: true,
    transport: "service",
  },
] as const satisfies readonly ToolDefinition[];

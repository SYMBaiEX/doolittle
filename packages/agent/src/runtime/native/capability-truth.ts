export interface NativeCapabilityTruthRecord {
  id: string;
  packageName: string;
  headline: string;
  summary: string;
  runtimeSurfaces: string[];
  requiredStatusFields: string[];
  realBehavior: string[];
  degradedBehavior: string[];
  caveats: string[];
}

const CAPABILITY_TRUTH: NativeCapabilityTruthRecord[] = [
  {
    id: "browser.browser",
    packageName: "@elizaos/plugin-browser",
    headline:
      "Browser capture is truthful about pixel versus placeholder output.",
    summary:
      "The browser adapter exposes browser-backed capture when a Lightpanda-compatible command is available, and it falls back to placeholder artifacts when browser execution is unavailable.",
    runtimeSurfaces: [
      "GET /browser/status",
      "POST /browser/capture",
      "POST /browser/screenshot",
      "POST /browser/analyze",
    ],
    requiredStatusFields: ["captureMode", "captureReady", "provider", "mode"],
    realBehavior: [
      "Returns pixel-backed PNG screenshot artifacts when the configured browser backend is executable.",
      "Keeps browser status explicit so the caller can see whether capture is running in browser or fallback mode.",
      "Preserves placeholder markdown and SVG artifacts as the degraded path instead of pretending screenshots are real.",
    ],
    degradedBehavior: [
      "Falls back to placeholder markdown capture output when the browser backend is unavailable or fetch execution fails.",
      "Reports captureMode=placeholder and captureReady=false instead of claiming full screenshot readiness.",
    ],
    caveats: [
      "Pixel capture is a lightweight raster card generated from the fetched page snapshot, not a full DOM screenshot engine.",
      "Interactive upstream browser claims such as CAPTCHA solving and session management are not part of the documented Doolittle runtime contract.",
    ],
  },
  {
    id: "media.tts",
    packageName: "@elizaos/plugin-tts",
    headline:
      "TTS is a runtime adapter with explicit active versus degraded readiness.",
    summary:
      "The TTS adapter delegates to the runtime media service, exposes backend selection, and degrades truthfully when no supported speech backend is configured.",
    runtimeSurfaces: ["GET /runtime/media", "POST /media/speak"],
    requiredStatusFields: ["ready", "backend", "mode"],
    realBehavior: [
      "Reports backend=fal or backend=openai when a speech backend is configured.",
      "Routes speech generation through the runtime media service instead of shipping a stub-only plugin.",
      "Keeps the adapter loaded even when speech generation is unavailable so callers can inspect truthful status.",
    ],
    degradedBehavior: [
      "Reports mode=degraded and backend=null when no speech backend is configured.",
      "Does not claim enablement solely because the plugin package is installed.",
    ],
    caveats: [
      "The runtime contract is readiness-first: callers should inspect status before treating speech generation as available.",
    ],
  },
  {
    id: "research.autocoder",
    packageName: "@elizaos/plugin-autocoder",
    headline:
      "Autocoder remains experimental and planning-first until real mutation flows are fully implemented.",
    summary:
      "The autocoder plugin supports research, planning, GitHub, and secrets workflows, but planning-only flows are explicitly non-mutating and surfaced as experimental.",
    runtimeSurfaces: [
      "POST /codegen/generate",
      "POST /codegen/research",
      "POST /codegen/prd",
      "POST /codegen/qa",
    ],
    requiredStatusFields: ["experimental", "executed"],
    realBehavior: [
      "Returns planning-only scaffolds with executed=false for non-mutating code generation flows.",
      "Keeps GitHub and secrets helpers available without overstating end-to-end execution support.",
      "Marks the runtime catalog entry as maturity=experimental.",
    ],
    degradedBehavior: [
      "Does not claim files were written or dependencies were installed when the plugin only produced a plan.",
      "Avoids presenting suggested next steps as completed execution.",
    ],
    caveats: [
      "The autocoder surface is still useful for structured planning, but it should not be documented as a production-grade autonomous code writer yet.",
    ],
  },
];

export function listNativeCapabilityTruth(): NativeCapabilityTruthRecord[] {
  return [...CAPABILITY_TRUTH];
}

export function getNativeCapabilityTruth(
  id: string,
): NativeCapabilityTruthRecord | undefined {
  return CAPABILITY_TRUTH.find((entry) => entry.id === id);
}

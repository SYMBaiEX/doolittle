import { z } from "zod";

export const UI_PLUGIN_CAPABILITIES = [
  "conversation.read",
  "message.send",
  "run.stop",
  "attachment.pick",
  "surface.open",
] as const;
export type UiPluginCapability = (typeof UI_PLUGIN_CAPABILITIES)[number];
export type UiPluginTrustTier = "trusted-react" | "community-static";

const identifier = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/u);
const assetPath = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[a-zA-Z0-9_./-]+$/u)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.split("/").some((part) => !part || part === "." || part === ".."),
    "Assets must use explicit relative paths without traversal.",
  );

/** Approval identity is computed by the host from immutable installed bytes. */
export interface UiPluginArtifactIdentity {
  pluginId: string;
  pluginVersion: string;
  digest: string;
}

export const uiPluginManifestV1Schema = z
  .object({
    kind: z.literal("doolittle.ui-plugin"),
    manifestVersion: z.literal(1),
    id: identifier,
    name: z.string().trim().min(1).max(80),
    description: z.string().max(500),
    pluginVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u),
    trustTier: z.enum(["trusted-react", "community-static"]),
    compatibility: z
      .object({ uiHostMajor: z.literal(1), uiPackageMajor: z.literal(0) })
      .strict(),
    entry: assetPath,
    assets: z
      .array(
        z
          .object({
            path: assetPath,
            sha256: z.string().regex(/^[a-f0-9]{64}$/u),
            bytes: z
              .number()
              .int()
              .min(0)
              .max(16 * 1024 * 1024),
          })
          .strict(),
      )
      .min(1)
      .max(256),
    requestedCapabilities: z
      .array(z.enum(UI_PLUGIN_CAPABILITIES))
      .max(UI_PLUGIN_CAPABILITIES.length),
    contributions: z
      .object({
        workspaces: z
          .array(
            z
              .object({
                id: identifier,
                title: z.string().trim().min(1).max(80),
              })
              .strict(),
          )
          .max(8),
        panels: z
          .array(
            z
              .object({
                id: identifier,
                title: z.string().trim().min(1).max(80),
              })
              .strict(),
          )
          .max(16),
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = manifest.assets.map((asset) => asset.path);
    const entrySuffix =
      manifest.trustTier === "trusted-react" ? /\.m?js$/u : /\.html$/u;
    if (
      new Set(paths).size !== paths.length ||
      !paths.includes(manifest.entry) ||
      !entrySuffix.test(manifest.entry)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A unique, verified entry asset is required for the selected trust tier.",
      });
    }
    if (
      manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0) >
      32 * 1024 * 1024
    ) {
      context.addIssue({
        code: "custom",
        message: "UI artifacts must be 32 MB or smaller.",
      });
    }
    if (
      new Set(manifest.requestedCapabilities).size !==
      manifest.requestedCapabilities.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Capability requests must be unique.",
      });
    }
    const contributions = [
      ...manifest.contributions.workspaces,
      ...manifest.contributions.panels,
    ];
    if (
      new Set(contributions.map((item) => item.id)).size !==
      contributions.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Contribution identifiers must be unique.",
      });
    }
  });
export type UiPluginManifestV1 = z.infer<typeof uiPluginManifestV1Schema>;

/** No wildcards or implicit future-session scopes in community grants. */
export interface UiPluginGrant {
  artifact: UiPluginArtifactIdentity;
  generation: number;
  capabilities: UiPluginCapability[];
  targets: Array<{ botId: string; sessionId: string; projectId?: string }>;
  approvedAt: string;
}

export function parseUiPluginManifestV1(value: unknown): UiPluginManifestV1 {
  return uiPluginManifestV1Schema.parse(value);
}

import { basename } from "node:path";
import type {
  AutocoderPipelineRunRecord,
  AutocoderPipelineService,
  AutocoderPipelineWorkflowRecord,
} from "@/services/autocoder-pipeline";

export interface PublicArtifactDescriptor {
  index: number;
  name: string;
}

export interface PublicManifestDescriptor {
  name: string;
  index?: number;
}

export type PublicAutocoderRun = Omit<
  AutocoderPipelineRunRecord,
  "artifactPaths"
> & {
  artifacts: PublicArtifactDescriptor[];
  artifactCount: number;
};

export type PublicAutocoderWorkflow = Omit<
  AutocoderPipelineWorkflowRecord,
  "artifactPaths"
> & {
  artifacts: PublicArtifactDescriptor[];
  artifactCount: number;
};

function toArtifactDescriptors(
  artifactPaths: readonly string[] | undefined,
): PublicArtifactDescriptor[] {
  return (artifactPaths ?? []).map((artifactPath, index) => ({
    index,
    name: basename(artifactPath),
  }));
}

export function toPublicAutocoderRun(
  record: AutocoderPipelineRunRecord,
): PublicAutocoderRun {
  const { artifactPaths, ...run } = record;
  const artifacts = toArtifactDescriptors(artifactPaths);
  return {
    ...run,
    artifacts,
    artifactCount: artifacts.length,
  };
}

export function toPublicAutocoderWorkflow(
  record: AutocoderPipelineWorkflowRecord,
): PublicAutocoderWorkflow {
  const { artifactPaths, ...workflow } = record;
  const artifacts = toArtifactDescriptors(artifactPaths);
  return {
    ...workflow,
    artifacts,
    artifactCount: artifacts.length,
  };
}

type PipelineSummary = ReturnType<AutocoderPipelineService["summary"]>;

export function toPublicAutocoderSummary(summary: PipelineSummary): Omit<
  PipelineSummary,
  "latest" | "latestWorkflow"
> & {
  latest?: PublicAutocoderRun;
  latestWorkflow?: PublicAutocoderWorkflow;
} {
  const { latest, latestWorkflow, ...counts } = summary;
  return {
    ...counts,
    latest: latest ? toPublicAutocoderRun(latest) : undefined,
    latestWorkflow: latestWorkflow
      ? toPublicAutocoderWorkflow(latestWorkflow)
      : undefined,
  };
}

export function toPublicAutocoderWorkflowView(
  view: ReturnType<AutocoderPipelineService["workflow"]>,
): {
  workflow?: PublicAutocoderWorkflow;
  runs: PublicAutocoderRun[];
  tree: Array<PublicAutocoderRun & { children: PublicAutocoderRun[] }>;
} {
  return {
    workflow: view.workflow
      ? toPublicAutocoderWorkflow(view.workflow)
      : undefined,
    runs: view.runs.map(toPublicAutocoderRun),
    tree: view.tree.map(({ children, ...run }) => ({
      ...toPublicAutocoderRun(run),
      children: children.map(toPublicAutocoderRun),
    })),
  };
}

export function toPublicAutocoderBundle(
  bundle: ReturnType<AutocoderPipelineService["bundleWorkflow"]>,
): {
  workflow?: PublicAutocoderWorkflow;
  runs: PublicAutocoderRun[];
  manifest?: PublicManifestDescriptor;
} {
  const manifestIndex =
    bundle.manifestPath && bundle.workflow
      ? bundle.workflow.artifactPaths.indexOf(bundle.manifestPath)
      : -1;
  return {
    workflow: bundle.workflow
      ? toPublicAutocoderWorkflow(bundle.workflow)
      : undefined,
    runs: bundle.runs.map(toPublicAutocoderRun),
    manifest: bundle.manifestPath
      ? {
          name: basename(bundle.manifestPath),
          ...(manifestIndex >= 0 ? { index: manifestIndex } : {}),
        }
      : undefined,
  };
}

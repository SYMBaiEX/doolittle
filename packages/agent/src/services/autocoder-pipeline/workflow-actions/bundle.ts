import { bundleAutocoderWorkflow } from "../read-model";
import type { AutocoderPipelineWorkflowRecord } from "../service";
import type { AutocoderPipelineWorkflowHelpers } from "./helpers";

export interface AutocoderPipelineWorkflowBundleActions {
  bundleWorkflow(id: string): {
    workflow?: AutocoderPipelineWorkflowRecord;
    runs: import("../service").AutocoderPipelineRunRecord[];
    manifestPath?: string;
  };
}

export function createAutocoderPipelineWorkflowBundleActions(
  helpers: AutocoderPipelineWorkflowHelpers,
): AutocoderPipelineWorkflowBundleActions {
  const bundleWorkflow: AutocoderPipelineWorkflowBundleActions["bundleWorkflow"] =
    (id) => {
      const store = helpers.loadStore();
      return bundleAutocoderWorkflow({
        store,
        id,
        nowIso: helpers.nowIso,
        writeArtifact: (runId, targetName, kind, value) =>
          helpers.persistence.writeArtifact(
            runId,
            targetName ?? "workflow",
            kind,
            value,
          ),
        saveStore: (nextStore) => {
          helpers.saveStore(nextStore);
        },
      });
    };

  return {
    bundleWorkflow,
  };
}

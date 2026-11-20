import type { AutocoderPipelinePersistence } from "../persistence";
import { createAutocoderPipelineWorkflowBundleActions } from "./bundle";
import { createAutocoderPipelineWorkflowHelpers } from "./helpers";
import { createAutocoderPipelineWorkflowRecordActions } from "./record";
import { createAutocoderPipelineWorkflowRunActions } from "./run";
import { createAutocoderPipelineWorkflowStartActions } from "./workflow";

export function createAutocoderPipelineWorkflowActions(
  persistence: AutocoderPipelinePersistence,
) {
  const helpers = createAutocoderPipelineWorkflowHelpers(persistence);
  const startActions = createAutocoderPipelineWorkflowStartActions(
    persistence,
    helpers,
  );
  const runActions = createAutocoderPipelineWorkflowRunActions(helpers);
  const recordActions = createAutocoderPipelineWorkflowRecordActions(
    helpers,
    startActions,
    runActions,
  );
  const bundleActions = createAutocoderPipelineWorkflowBundleActions(helpers);

  return {
    ...startActions,
    ...runActions,
    ...recordActions,
    ...bundleActions,
  };
}

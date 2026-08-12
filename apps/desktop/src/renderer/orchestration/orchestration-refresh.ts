export interface ReloadableResource {
  reload: () => void;
}

export interface DelegationRefreshResources {
  overview: ReloadableResource;
  taskDetail: ReloadableResource;
  tasks: ReloadableResource;
  workers: ReloadableResource;
}

export interface CodegenRefreshResources {
  runDetail: ReloadableResource;
  runs: ReloadableResource;
  runtime: ReloadableResource;
  selectedRunId: string;
  selectedWorkflowId: string;
  workflowDetail: ReloadableResource;
  workflows: ReloadableResource;
}

export interface OrchestrationRefreshResources
  extends DelegationRefreshResources,
    CodegenRefreshResources {
  accountPool: ReloadableResource;
  plans: ReloadableResource;
  worktrees: ReloadableResource;
}

export function refreshDelegationResources({
  overview,
  taskDetail,
  tasks,
  workers,
}: DelegationRefreshResources): void {
  tasks.reload();
  taskDetail.reload();
  workers.reload();
  overview.reload();
}

export function refreshCodegenResources({
  runDetail,
  runs,
  runtime,
  selectedRunId,
  selectedWorkflowId,
  workflowDetail,
  workflows,
}: CodegenRefreshResources): void {
  runtime.reload();
  workflows.reload();
  runs.reload();
  if (selectedWorkflowId) workflowDetail.reload();
  if (selectedRunId) runDetail.reload();
}

export function refreshOrchestrationResources(
  resources: OrchestrationRefreshResources,
): void {
  refreshDelegationResources(resources);
  resources.worktrees.reload();
  resources.plans.reload();
  resources.accountPool.reload();
  refreshCodegenResources(resources);
}

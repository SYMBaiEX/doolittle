export interface DelegationMutationOptions {
  runDelegationTaskInWorker: (
    taskId: string,
    options?: { assumeRunning?: boolean },
  ) => Promise<unknown>;
}

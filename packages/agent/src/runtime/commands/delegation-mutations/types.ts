export interface DelegationMutationOptions {
  executeDelegationTask: (taskId: string) => Promise<unknown>;
}

export interface AcpTaskSubmissionEvent {
  preventDefault(): void;
}

export async function submitAcpEditorTask(
  event: AcpTaskSubmissionEvent,
  prompt: (task: string) => Promise<unknown>,
  task: string,
): Promise<void> {
  event.preventDefault();
  await prompt(task);
}

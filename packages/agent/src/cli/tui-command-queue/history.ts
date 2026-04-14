export interface TuiCommandHistoryController {
  record(command: string): void;
  back(): string | undefined;
  forward(): string | undefined;
  hasHistory(): boolean;
}

export function createTuiCommandHistory(): TuiCommandHistoryController {
  const commandHistory: string[] = [];
  let historyIndex = 0;

  return {
    record(command) {
      if (
        commandHistory.length === 0 ||
        commandHistory[commandHistory.length - 1] !== command
      ) {
        commandHistory.push(command);
      }
      historyIndex = commandHistory.length;
    },
    back() {
      if (!commandHistory.length) {
        return undefined;
      }
      historyIndex = Math.max(0, historyIndex - 1);
      return commandHistory[historyIndex] ?? "";
    },
    forward() {
      if (!commandHistory.length) {
        return undefined;
      }
      historyIndex = Math.min(commandHistory.length, historyIndex + 1);
      return commandHistory[historyIndex] ?? "";
    },
    hasHistory() {
      return commandHistory.length > 0;
    },
  };
}

import { installTuiStartCommandQueue } from "./command-queue";
import { installTuiStartInputBindings } from "./input-bindings";
import { installTuiStartLifecycle } from "./lifecycle";
import { installTuiStartRuntimeObservers } from "./runtime-observers";
import { installTuiStartScreenBindings } from "./screen-bindings";
import { installTuiStartScreenEvents } from "./screen-events";
import type {
  TuiStartControllersOptions,
  TuiStartControllersResult,
} from "./types";

export type {
  TuiStartControllersOptions,
  TuiStartControllersResult,
} from "./types";

export function installTuiStartControllers(
  options: TuiStartControllersOptions,
): TuiStartControllersResult {
  const tuiLifecycle = installTuiStartLifecycle(options);

  const tuiCommandQueue = installTuiStartCommandQueue(options, (exitCode) => {
    tuiLifecycle.exitCli(exitCode);
  });

  options.surfaces.assemblyState.setQueueCommand((line: string) => {
    tuiCommandQueue.queueCommand(line);
  });

  installTuiStartInputBindings(options, tuiCommandQueue);
  installTuiStartScreenBindings(options, tuiLifecycle);
  installTuiStartScreenEvents(options);

  const disposeObservers = installTuiStartRuntimeObservers(options);

  return {
    dispose: () => {
      tuiLifecycle.dispose();
      disposeObservers();
    },
  };
}

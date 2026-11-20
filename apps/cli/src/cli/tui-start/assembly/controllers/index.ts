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

  try {
    const tuiCommandQueue = installTuiStartCommandQueue(
      options,
      tuiLifecycle.exitCli,
    );

    options.surfaces.assemblyState.setQueueCommand(
      tuiCommandQueue.queueCommand,
    );

    installTuiStartInputBindings(options, tuiCommandQueue);
    installTuiStartScreenBindings(options, tuiLifecycle);
    installTuiStartScreenEvents(options);

    const disposeObservers = installTuiStartRuntimeObservers(options);

    return {
      dispose: () => {
        try {
          tuiLifecycle.dispose();
        } finally {
          disposeObservers();
        }
      },
    };
  } catch (error) {
    tuiLifecycle.dispose();
    throw error;
  }
}

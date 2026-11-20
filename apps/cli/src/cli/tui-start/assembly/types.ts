import type { TuiCommandQueueState } from "../../tui-command-queue";
import type { TuiLifecycleState } from "../../tui-lifecycle/types";
import type { TuiStartSetupOptions } from "../setup";

export interface TuiStartAssemblyOptions extends TuiStartSetupOptions {
  lifecycleState: TuiLifecycleState;
  queueState: TuiCommandQueueState;
}

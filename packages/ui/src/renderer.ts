import type { UiPluginPresentationV1 } from "@doolittle/contracts/ui-plugin";
import type { ComponentType } from "react";
import type { UiHostV1 } from "./host";

export interface UiRendererProps {
  host: UiHostV1;
  /** Host-selected registered workspace/panel. Changing it does not replace runs. */
  presentation?: UiPluginPresentationV1;
}

/** Trusted, prebuilt ESM entry points export createRenderer. Not a sandbox. */
export type UiRendererFactoryV1 = (
  react: typeof import("react"),
  ui: typeof import("./index"),
) => ComponentType<UiRendererProps>;

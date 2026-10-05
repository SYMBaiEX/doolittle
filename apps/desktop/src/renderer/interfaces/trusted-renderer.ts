import type { UiRendererFactoryV1, UiRendererProps } from "@doolittle/ui";
import type { ComponentType } from "react";

/** Main supplied exact digest URLs only; never renderer-provided paths or code. */
export async function loadTrustedRenderer(
  entryUrl: string,
): Promise<ComponentType<UiRendererProps>> {
  if (
    !/^doolittle-ui:\/\/trusted\/[a-f0-9]{64}\/[a-zA-Z0-9_./-]+\.m?js$/u.test(
      entryUrl,
    ) ||
    entryUrl.split("/").some((segment) => segment === "." || segment === "..")
  )
    throw new Error("The approved interface entry is unavailable.");
  const [module, react, ui] = await Promise.all([
    import(/* @vite-ignore */ entryUrl) as Promise<{
      createRenderer?: UiRendererFactoryV1;
    }>,
    import("react"),
    import("@doolittle/ui"),
  ]);
  if (typeof module.createRenderer !== "function")
    throw new Error("The interface must export createRenderer for UI host v1.");
  const Renderer = module.createRenderer(react, ui);
  if (typeof Renderer !== "function")
    throw new Error("The interface did not return a React component.");
  return Renderer;
}

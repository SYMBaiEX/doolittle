import { type ComponentType, lazy, useState } from "react";

export function createPreloadedComponent<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
) {
  let resolved: ComponentType<Props> | undefined;
  let pending: ReturnType<typeof load> | undefined;
  const preload = () => {
    pending ??= load().then((module) => {
      resolved = module.default;
      return module;
    });
    return pending;
  };
  const Lazy = lazy(preload);

  // biome-ignore lint/correctness/noComponentHookFactories: These wrappers are created outside render. Route recovery intentionally replaces the wrapper.
  function Component(props: Props) {
    // A fulfilled import can render without suspending. Keep the chosen
    // component type for this mount so a later preload cannot remount it.
    const [View] = useState(() => resolved ?? Lazy);
    return <View {...props} />;
  }

  return { Component, preload };
}

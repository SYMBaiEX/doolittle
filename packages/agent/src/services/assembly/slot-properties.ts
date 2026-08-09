import type { LazySlot } from "../lazy-slot";

type SlotBackedValue<TSlot> =
  TSlot extends LazySlot<infer TValue> ? TValue : never;

export function defineSlotBackedProperties<
  TTarget extends object,
  TSlots extends { [K in keyof TSlots]: LazySlot<unknown> },
>(
  target: TTarget,
  slots: TSlots,
): TTarget & { [K in keyof TSlots]: SlotBackedValue<TSlots[K]> } {
  const descriptors: PropertyDescriptorMap = {};

  for (const key of Object.keys(slots) as Array<keyof TSlots>) {
    const slot = slots[key];
    const propertyKey = String(key);
    descriptors[propertyKey] = {
      configurable: true,
      enumerable: true,
      get: () => slot.get(),
      set: (value: unknown) => {
        slot.set(value as never);
      },
    };
  }

  Object.defineProperties(target, descriptors);
  return target as TTarget & {
    [K in keyof TSlots]: SlotBackedValue<TSlots[K]>;
  };
}

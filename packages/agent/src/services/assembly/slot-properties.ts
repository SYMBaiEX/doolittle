import type { LazySlot } from "../lazy-slot";

type SlotMap = Record<string, LazySlot<unknown>>;

type SlotBackedValue<TSlot> =
  TSlot extends LazySlot<infer TValue> ? TValue : never;

export function defineSlotBackedProperties<
  TTarget extends object,
  TSlots extends SlotMap,
>(
  target: TTarget,
  slots: TSlots,
): TTarget & { [K in keyof TSlots]: SlotBackedValue<TSlots[K]> } {
  const descriptors: PropertyDescriptorMap = {};

  for (const [key, slot] of Object.entries(slots)) {
    descriptors[key] = {
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

export interface LazySlot<T> {
  get(): T;
  set(value: T): void;
  peek(): T | undefined;
}

export function createLazySlot<T>(factory: () => T): LazySlot<T> {
  let instance: T | undefined;
  return {
    get(): T {
      if (instance === undefined) {
        instance = factory();
      }
      return instance;
    },
    set(value: T): void {
      instance = value;
    },
    peek(): T | undefined {
      return instance;
    },
  };
}

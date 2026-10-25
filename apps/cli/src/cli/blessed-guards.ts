type BlessedTextboxPrototype = {
  __elizaSafeEnterPatch?: boolean;
  __olistener?: (ch: string, key: { name?: string }) => unknown;
  _listener?: (ch: string, key: { name?: string }) => unknown;
  _done?: ((err: unknown, value: unknown) => unknown) | undefined;
};

type BlessedLike = {
  textbox?: {
    prototype?: BlessedTextboxPrototype;
  };
};

export function installBlessedTextboxGuard(blessedModule: BlessedLike): void {
  const prototype = blessedModule.textbox?.prototype;
  if (!prototype || prototype.__elizaSafeEnterPatch) {
    return;
  }

  const originalListener = prototype._listener;
  if (typeof originalListener !== "function") {
    return;
  }

  prototype._listener = function patchedTextboxListener(
    this: BlessedTextboxPrototype,
    ch: string,
    key: { name?: string },
  ) {
    if (key?.name === "enter" && typeof this._done !== "function") {
      return undefined;
    }
    return originalListener.call(this, ch, key);
  };
  prototype.__elizaSafeEnterPatch = true;
}

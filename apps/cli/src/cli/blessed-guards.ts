type BlessedKey = { name?: string };
type BlessedDone = (err: unknown, value: unknown) => unknown;

type BlessedTextareaPrototype = {
  __elizaSafeReadLifecyclePatch?: boolean;
  __listener?: unknown;
  _done?: BlessedDone | undefined;
  _reading?: boolean;
  cancel?: () => unknown;
  readInput?: (callback?: unknown) => unknown;
  removeListener(event: "keypress", listener: unknown): unknown;
};

type BlessedTextboxPrototype = {
  __elizaSafeEnterPatch?: boolean;
  __olistener?: (ch: string, key: BlessedKey) => unknown;
  _listener?: (ch: string, key: BlessedKey) => unknown;
  _done?: BlessedDone | undefined;
};

type BlessedLike = {
  textarea?: {
    (...args: never[]): unknown;
    prototype?: BlessedTextareaPrototype;
  };
  textbox?: {
    (...args: never[]): unknown;
    prototype?: BlessedTextboxPrototype;
  };
};

const nextTick = global.setImmediate || process.nextTick.bind(process);

function installReadLifecycleGuard(prototype: BlessedTextareaPrototype): void {
  if (prototype.__elizaSafeReadLifecyclePatch) {
    return;
  }
  const originalReadInput = prototype.readInput;
  const originalCancel = prototype.cancel;
  if (
    typeof originalReadInput !== "function" ||
    typeof originalCancel !== "function"
  ) {
    return;
  }

  prototype.readInput = function patchedReadInput(
    this: BlessedTextareaPrototype,
    callback?: unknown,
  ) {
    const wasReading = this._reading === true;
    const result = originalReadInput.call(this, callback);
    if (!wasReading && this._reading === true) {
      const done = this._done;
      // Blessed attaches its key listener one tick after starting the read. If
      // blur/cancel completes that read first, the delayed attachment otherwise
      // becomes a zombie listener; reopening the entry then duplicates keys.
      // This callback is queued after blessed's own attachment callback, so it
      // can remove the listener for exactly the already-completed read.
      nextTick(() => {
        if (this._reading === true && this._done === done) {
          return;
        }
        if (this.__listener) {
          this.removeListener("keypress", this.__listener);
          delete this.__listener;
        }
      });
    }
    return result;
  };

  prototype.cancel = function patchedCancel(this: BlessedTextareaPrototype) {
    if (!this.__listener) {
      // blessed's stock cancel() forwards Escape through __listener, making it
      // a no-op during the one-tick half-open window. The completion callback
      // already exists synchronously, so use it directly; the readInput guard
      // above prevents the delayed listener from surviving afterwards.
      if (this._reading === true && typeof this._done === "function") {
        return this._done(null, null);
      }
      return undefined;
    }
    return originalCancel.call(this);
  };

  prototype.__elizaSafeReadLifecyclePatch = true;
}

export function installBlessedTextboxGuard(blessedModule: BlessedLike): void {
  const textareaPrototype = blessedModule.textarea?.prototype;
  if (textareaPrototype) {
    installReadLifecycleGuard(textareaPrototype);
  }

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
    key: BlessedKey,
  ) {
    if (key?.name === "enter" && typeof this._done !== "function") {
      return undefined;
    }
    return originalListener.call(this, ch, key);
  };
  prototype.__elizaSafeEnterPatch = true;
}

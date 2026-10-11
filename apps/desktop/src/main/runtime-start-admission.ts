let shutdownHolds = 0;

/** Quit owns every desktop child, including children created by the bot registry. */
export function holdRuntimeStarts(): () => void {
  shutdownHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    shutdownHolds -= 1;
  };
}

export function runtimeStartsAllowed(): boolean {
  return shutdownHolds === 0;
}

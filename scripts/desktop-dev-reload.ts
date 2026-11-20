/** Serializes successful watch builds into graceful development-app restarts. */
export class DesktopDevReload {
  private readonly ready = new Set<string>();
  private generation = 0;
  private applied = -1;
  private timer?: ReturnType<typeof setTimeout>;
  private draining = false;
  private closed = false;

  constructor(
    private readonly surfaces: readonly string[],
    private readonly restart: (canStart: () => boolean) => Promise<void>,
    private readonly onError: (error: unknown) => void,
    private readonly debounceMs = 150,
  ) {}

  buildStarted(surface: string): void {
    this.ready.delete(surface);
    this.generation++;
    clearTimeout(this.timer);
  }

  buildFinished(surface: string, success: boolean): void {
    if (success) this.ready.add(surface);
    else this.ready.delete(surface);
    this.schedule();
  }

  invalidate(): void {
    this.generation++;
    this.schedule();
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
  }

  private allReady(): boolean {
    return this.surfaces.every((surface) => this.ready.has(surface));
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (this.closed || !this.allReady()) return;
    this.timer = setTimeout(() => void this.drain(), this.debounceMs);
  }

  private async drain(): Promise<void> {
    if (
      this.closed ||
      this.draining ||
      !this.allReady() ||
      this.applied === this.generation
    )
      return;
    this.draining = true;
    const generation = this.generation;
    try {
      await this.restart(
        () => !this.closed && this.allReady() && generation === this.generation,
      );
      this.applied = generation;
    } catch (error) {
      this.onError(error);
      // Retry only after a new edit; never loop against a blocked shutdown.
      this.applied = this.generation;
    } finally {
      this.draining = false;
      if (this.applied !== this.generation) this.schedule();
    }
  }
}

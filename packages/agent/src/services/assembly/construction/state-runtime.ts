import { createLazySlot, type LazySlot } from "../../lazy-slot";

export interface RuntimeBoundDocumentsState<TRuntime, TDocuments> {
  documents: LazySlot<TDocuments>;
  createDocumentsService(nextRuntime: TRuntime): TDocuments;
  setBoundRuntime(nextRuntime: TRuntime): void;
}

export function createRuntimeBoundDocumentsState<TRuntime, TDocuments>(
  runtime: TRuntime | undefined,
  createDocuments: (nextRuntime: TRuntime) => TDocuments,
): RuntimeBoundDocumentsState<TRuntime, TDocuments> {
  let boundRuntime = runtime;
  const createDocumentsService = (nextRuntime: TRuntime): TDocuments =>
    createDocuments(nextRuntime);
  const documents = createLazySlot(() => {
    if (!boundRuntime) {
      throw new Error(
        "DocumentsService requires the initialized Eliza runtime.",
      );
    }
    return createDocumentsService(boundRuntime);
  });

  return {
    documents,
    createDocumentsService,
    setBoundRuntime(nextRuntime: TRuntime) {
      boundRuntime = nextRuntime;
    },
  };
}

import type { SessionServiceApi } from "./api";
import type { SessionService } from "./index";
import { getSessionServiceState } from "./state";

export const sessionServiceTransferMethods: Pick<
  SessionServiceApi,
  "exportSessionArchive" | "importSessionArchive" | "previewSessionArchive"
> &
  ThisType<SessionService> = {
  exportSessionArchive(sessionId) {
    return getSessionServiceState(this).transfers.exportSessionArchive(
      sessionId,
    );
  },
  previewSessionArchive(input) {
    return getSessionServiceState(this).transfers.previewSessionArchive(input);
  },
  importSessionArchive(input) {
    return getSessionServiceState(this).transfers.importSessionArchive(input);
  },
};

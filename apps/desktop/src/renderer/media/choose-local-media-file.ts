import { errorMessage } from "../lib";

export async function chooseLocalMediaFile(
  onSelect: (path: string) => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const selection = await window.doolittle.pickFiles();
    const selected = selection.paths[0];
    if (!selection.canceled && selected) onSelect(selected);
  } catch (error) {
    onError(errorMessage(error));
  }
}

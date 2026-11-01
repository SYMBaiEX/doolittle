import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../../packages/ui/src/controls";
import { ContactRow } from "../../packages/ui/src/surfaces";

/** Actual shared components, rendered offscreen only to measure their CSS pairs. */
export function themeContrastFixture() {
  return renderToStaticMarkup(
    <aside className="app-sidebar">
      <ContactRow
        name="Contrast witness"
        avatar="D"
        detail="Lead"
        selected
        state="error"
        onSelect={() => {}}
      />
      <Button data-contrast-primary>Save</Button>
      <Button variant="destructive" data-contrast-destructive>
        Delete
      </Button>
    </aside>,
  );
}

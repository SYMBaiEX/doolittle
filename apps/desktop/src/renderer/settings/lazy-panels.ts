import { lazy } from "react";

export const LazyModelsPage = lazy(async () => {
  const module = await import("../ModelsPage");
  return { default: module.ModelsPage };
});

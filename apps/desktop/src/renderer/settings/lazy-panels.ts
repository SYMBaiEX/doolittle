import { lazy } from "react";

export const LazyModelsPage = lazy(async () => {
  const module = await import("../ModelsPage");
  return { default: module.ModelsPage };
});

export const LazyConnectionsPage = lazy(async () => {
  const module = await import("../ConnectionsPage");
  return { default: module.ConnectionsPage };
});

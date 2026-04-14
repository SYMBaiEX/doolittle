import type { AppContext } from "@/runtime/bootstrap";
import {
  handleSkillsCatalogRoutes,
  handleSkillsFamiliesRoutes,
} from "./catalog";
import { handleGeneratedSkillsRoutes } from "./generated";
import { handleSkillsHubRoutes } from "./hub";
import { handleSkillsInstalledRoutes } from "./installed";
import { handleSkillsManifestRoutes } from "./manifest";
import { handleSkillsMutationRoutes } from "./mutations";
import { handleSkillsSummaryRoutes } from "./summary";

export async function handleSkillRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const response = await handleSkillsSummaryRoutes(context, request, url);
  if (response) return response;

  const catalogResponse = await handleSkillsCatalogRoutes(
    context,
    request,
    url,
  );
  if (catalogResponse) return catalogResponse;

  const familiesResponse = await handleSkillsFamiliesRoutes(
    context,
    request,
    url,
  );
  if (familiesResponse) return familiesResponse;

  const manifestResponse = await handleSkillsManifestRoutes(
    context,
    request,
    url,
  );
  if (manifestResponse) return manifestResponse;

  const generatedResponse = await handleGeneratedSkillsRoutes(
    context,
    request,
    url,
  );
  if (generatedResponse) return generatedResponse;

  const hubResponse = await handleSkillsHubRoutes(context, request, url);
  if (hubResponse) return hubResponse;

  const installedResponse = await handleSkillsInstalledRoutes(
    context,
    request,
    url,
  );
  if (installedResponse) return installedResponse;

  const mutationResponse = await handleSkillsMutationRoutes(
    context,
    request,
    url,
  );
  return mutationResponse;
}

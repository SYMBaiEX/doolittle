import type { SessionServiceApi } from "./api";
import type { SessionService } from "./index";
import { getSessionServiceState } from "./state";

export const sessionServiceProjectMethods: Pick<
  SessionServiceApi,
  | "listProjects"
  | "getProject"
  | "createProject"
  | "updateProject"
  | "archiveProject"
  | "projectResources"
  | "addProjectResource"
  | "removeProjectResource"
  | "assignSessionProject"
  | "projectIdForSession"
> &
  ThisType<SessionService> = {
  listProjects(includeArchived = false) {
    return getSessionServiceState(this).projects.list(includeArchived);
  },
  getProject(id) {
    return getSessionServiceState(this).projects.get(id);
  },
  createProject(input) {
    return getSessionServiceState(this).projects.create(input);
  },
  updateProject(id, input) {
    return getSessionServiceState(this).projects.update(id, input);
  },
  archiveProject(id, archived) {
    return getSessionServiceState(this).projects.archive(id, archived);
  },
  projectResources(projectId) {
    return getSessionServiceState(this).projects.resources(projectId);
  },
  addProjectResource(projectId, input) {
    return getSessionServiceState(this).projects.addResource(projectId, input);
  },
  removeProjectResource(projectId, resourceId) {
    return getSessionServiceState(this).projects.removeResource(
      projectId,
      resourceId,
    );
  },
  assignSessionProject(sessionId, projectId) {
    return getSessionServiceState(this).projects.assignSession(
      sessionId,
      projectId,
    );
  },
  projectIdForSession(sessionId) {
    return getSessionServiceState(this).projects.projectIdForSession(sessionId);
  },
};

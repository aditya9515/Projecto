import { handleTrusted } from "./trustedSender";
import { dialog, type OpenDialogOptions } from "electron";
import { z } from "zod";

import {
  canUseBulkImport,
  createUpgradeRequiredError,
} from "../../billing/upgradeGate";
import { CreateProjectInputSchema, ProjectUpdateSchema } from "../types/shared";
import { ActivityStore } from "../services/activityStore";
import { ProjectScanner } from "../services/projectScanner";
import { ProjectStore } from "../services/projectStore";
import { SubscriptionService } from "../services/subscriptionService";

const idSchema = z.string().min(1);
const pathSchema = z.string().trim().min(1);
const bulkImportSchema = z.array(CreateProjectInputSchema).min(1);

type RegisterProjectIpcOptions = {
  getMainWindow: () => Electron.BrowserWindow | null;
  projectScanner: ProjectScanner;
  projectStore: ProjectStore;
  activityStore: ActivityStore;
  subscriptionService: SubscriptionService;
};

export function registerProjectIpc({
  getMainWindow,
  projectScanner,
  projectStore,
  activityStore,
  subscriptionService,
}: RegisterProjectIpcOptions): void {
  handleTrusted("projects:selectFolder", async () => {
    const window = getMainWindow();
    const options: OpenDialogOptions = {
      title: "Select a project folder",
      properties: ["openDirectory"],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });

  handleTrusted("projects:scanFolder", async (_event, input) => {
    return projectScanner.scanFolder(pathSchema.parse(input));
  });

  handleTrusted("projects:scanWorkspace", async (_event, input) => {
    const subscription = await subscriptionService.getSubscriptionState();

    if (!canUseBulkImport(subscription)) {
      throw createUpgradeRequiredError("bulkImport");
    }

    return projectScanner.scanWorkspace(pathSchema.parse(input));
  });

  handleTrusted("projects:getProjects", async () => {
    return projectStore.getProjects();
  });

  handleTrusted("projects:getProject", async (_event, input) => {
    return projectStore.getProject(idSchema.parse(input));
  });

  handleTrusted("projects:createProject", async (_event, input) => {
    const project = await projectStore.createProject(
      CreateProjectInputSchema.parse(input),
    );
    await activityStore.recordActivity({
      kind: "project-imported",
      title: `Imported ${project.name}`,
      description: project.framework ?? project.detectedType,
      projectId: project.id,
    });
    return project;
  });

  handleTrusted("projects:bulkImportProjects", async (_event, input) => {
    const payload = bulkImportSchema.parse(input);
    const projects = await projectStore.bulkImportProjects(payload);

    await Promise.all(
      projects.map((project) =>
        activityStore.recordActivity({
          kind: "project-imported",
          title: `Imported ${project.name}`,
          description: project.framework ?? project.detectedType,
          projectId: project.id,
        }),
      ),
    );

    return projects;
  });

  handleTrusted("projects:updateProject", async (_event, id, patch) => {
    const projectId = idSchema.parse(id);
    const payload = ProjectUpdateSchema.parse(patch);

    return projectStore.updateProject(projectId, payload);
  });

  handleTrusted("projects:deleteProject", async (_event, input) => {
    await projectStore.deleteProject(idSchema.parse(input));
  });

  handleTrusted("projects:toggleFavorite", async (_event, input) => {
    return projectStore.toggleFavorite(idSchema.parse(input));
  });
}

import type { LaunchProfile, Project } from "../../main/types/shared";
type WorkspacePreset = {
  id: string;
  name: string;
  description: string;
  build: (project: Project) => LaunchProfile;
};
export function buildWorkspacePresets(project: Project): WorkspacePreset[] {
  const runnableCommandIds = project.commands
    .filter((command) => command.runOnLaunch)
    .map((command) => command.id);
  const firstRunnable = runnableCommandIds.slice(0, 1);
  const allCommandIds = project.commands.map((command) => command.id);
  return [
    {
      id: "preset-dev",
      name: "Quick Dev",
      description:
        "Open your editor, run the dev stack, and open suggested browser URLs.",
      build: (entry) => ({
        id: crypto.randomUUID(),
        name: "Quick Dev",
        openEditor: true,
        openFolder: false,
        openBrowser: entry.suggestedBrowserUrls.length > 0,
        browserUrls: entry.suggestedBrowserUrls,
        commandIds: runnableCommandIds,
        askBeforeRun: true,
      }),
    },
    {
      id: "preset-debug",
      name: "Editor + Browser",
      description:
        "Open the editor and browser with your primary dev command for quick context switching.",
      build: (entry) => ({
        id: crypto.randomUUID(),
        name: "Editor + Browser",
        openEditor: true,
        openFolder: false,
        openBrowser: entry.suggestedBrowserUrls.length > 0,
        browserUrls: entry.suggestedBrowserUrls,
        commandIds: firstRunnable,
        askBeforeRun: true,
      }),
    },
    {
      id: "preset-full",
      name: "Install + Launch",
      description:
        "Run every saved project command, then open the browser and editor.",
      build: (entry) => ({
        id: crypto.randomUUID(),
        name: "Install + Launch",
        openEditor: true,
        openFolder: true,
        openBrowser: entry.suggestedBrowserUrls.length > 0,
        browserUrls: entry.suggestedBrowserUrls,
        commandIds: allCommandIds,
        askBeforeRun: true,
      }),
    },
  ];
}

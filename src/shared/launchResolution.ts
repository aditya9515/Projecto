import type { LaunchCommand, LaunchProfile, Project } from "../main/types/shared";

export function orderProfileCommands(
  commandIds: string[],
  commands: LaunchCommand[],
): LaunchCommand[] {
  const commandMap = new Map(commands.map((command) => [command.id, command]));

  return commandIds
    .map((commandId) => commandMap.get(commandId))
    .filter((command): command is LaunchCommand => command !== undefined);
}

export function isDefaultLaunchProfile(profileName: string): boolean {
  return profileName.trim().toLowerCase() === "default launch";
}

export function getDefaultProfile(
  project: Project,
): LaunchProfile | undefined {
  return (
    project.launchProfiles.find(
      (profile) => profile.name === "Default Launch",
    ) ?? project.launchProfiles[0]
  );
}

export function getProfileCommands(
  project: Project,
  profile: LaunchProfile,
): LaunchCommand[] {
  return orderProfileCommands(profile.commandIds, project.commands);
}

export function getRunnableProfileCommands(
  project: Project,
  profile: LaunchProfile,
): LaunchCommand[] {
  const selectedCommands = getProfileCommands(project, profile).filter(
    (command) => command.runOnLaunch,
  );

  if (selectedCommands.length > 0) {
    return selectedCommands;
  }

  if (
    profile.commandIds.length === 0 ||
    isDefaultLaunchProfile(profile.name)
  ) {
    return project.commands.filter((command) => command.runOnLaunch);
  }

  return selectedCommands;
}

export function buildCommandConfirmationLines(
  command: LaunchCommand,
): string[] {
  return [`${command.command}`, `cwd: ${command.cwd}`];
}

export function buildProfileConfirmationLines(
  project: Project,
  profile: LaunchProfile,
): string[] {
  const commandLines = getRunnableProfileCommands(project, profile).flatMap(
    (command) => [
      `${command.label}: ${command.command}`,
      `cwd: ${command.cwd}`,
    ],
  );
  const urlLines = profile.openBrowser
    ? profile.browserUrls.map((url) => `url: ${url}`)
    : [];

  return [
    ...(profile.openEditor ? ["Open editor"] : []),
    ...(profile.openFolder ? ["Open folder in system explorer"] : []),
    ...commandLines,
    ...urlLines,
  ];
}

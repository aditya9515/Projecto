export const PROJECT_ALREADY_RUNNING_PREFIX = "PROJECT_ALREADY_RUNNING:";
export const PROJECT_PORT_OWNED_PREFIX = "PROJECT_PORT_OWNED:";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function createProjectAlreadyRunningError(projectId: string): Error {
  return new Error(`${PROJECT_ALREADY_RUNNING_PREFIX}${projectId}`);
}

export function createProjectPortOwnedError(
  port: number,
  projectId: string,
): Error {
  return new Error(`${PROJECT_PORT_OWNED_PREFIX}${port}:${projectId}`);
}

export function parseProjectAlreadyRunning(error: unknown): string | null {
  const message = getErrorMessage(error);

  if (!message.startsWith(PROJECT_ALREADY_RUNNING_PREFIX)) {
    return null;
  }

  const projectId = message.slice(PROJECT_ALREADY_RUNNING_PREFIX.length).trim();
  return projectId.length > 0 ? projectId : null;
}

export function parseProjectPortOwned(
  error: unknown,
): { port: number; projectId: string } | null {
  const message = getErrorMessage(error);

  if (!message.startsWith(PROJECT_PORT_OWNED_PREFIX)) {
    return null;
  }

  const [portValue, projectId] = message
    .slice(PROJECT_PORT_OWNED_PREFIX.length)
    .split(":");
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65_535 || !projectId) {
    return null;
  }

  return { port, projectId };
}

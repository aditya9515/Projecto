export const PROJECT_ALREADY_RUNNING_PREFIX = "PROJECT_ALREADY_RUNNING:";
export const PROJECT_PORT_OWNED_PREFIX = "PROJECT_PORT_OWNED:";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function findPrefixedPayload(message: string, prefix: string): string | null {
  const prefixIndex = message.indexOf(prefix);

  if (prefixIndex === -1) {
    return null;
  }

  return message.slice(prefixIndex + prefix.length).trim();
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
  const projectId = findPrefixedPayload(message, PROJECT_ALREADY_RUNNING_PREFIX);

  if (!projectId) {
    return null;
  }

  return projectId.length > 0 ? projectId : null;
}

export function parseProjectPortOwned(
  error: unknown,
): { port: number; projectId: string } | null {
  const message = getErrorMessage(error);
  const payload = findPrefixedPayload(message, PROJECT_PORT_OWNED_PREFIX);

  if (!payload) {
    return null;
  }

  const [portValue, projectId] = payload.split(":");
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65_535 || !projectId) {
    return null;
  }

  return { port, projectId };
}

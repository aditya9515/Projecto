import fs from "node:fs/promises";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";

export type DirectoryEntry = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
};

const RETRYABLE_FILE_ERROR_CODES = new Set([
  "EPERM",
  "EBUSY",
  "ENOTEMPTY",
  "EACCES",
]);
const READ_RETRYABLE_FILE_ERROR_CODES = new Set([
  ...RETRYABLE_FILE_ERROR_CODES,
]);
const FILE_RETRY_DELAYS_MS = [50, 100, 200, 400, 800] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function shouldRetryRead(
  error: unknown,
  options?: { hadPendingWrite?: boolean },
): boolean {
  const code = getErrorCode(error);
  return (
    error instanceof SyntaxError ||
    READ_RETRYABLE_FILE_ERROR_CODES.has(code ?? "") ||
    (options?.hadPendingWrite === true && code === "ENOENT")
  );
}

function shouldRetryWrite(error: unknown): boolean {
  return RETRYABLE_FILE_ERROR_CODES.has(getErrorCode(error) ?? "");
}

async function retryTransientFileOperation<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= FILE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= FILE_RETRY_DELAYS_MS.length || !shouldRetry(error)) {
        throw error;
      }

      await delay(FILE_RETRY_DELAYS_MS[attempt] ?? 800);
    }
  }

  throw lastError;
}

export class FileSystemService {
  private readonly writeQueues = new Map<string, Promise<void>>();

  async ensureDirectory(targetPath: string): Promise<void> {
    await fs.mkdir(targetPath, { recursive: true });
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(targetPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(targetPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async listDirectory(targetPath: string): Promise<DirectoryEntry[]> {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });

    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));
  }

  async readTextFile(targetPath: string): Promise<string | undefined> {
    try {
      return await fs.readFile(targetPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }

      throw error;
    }
  }

  async readJsonFile<T>(targetPath: string): Promise<T> {
    const queueKey = this.getQueueKey(targetPath);
    const pendingWrite = this.writeQueues.get(queueKey);
    const hadPendingWrite = Boolean(pendingWrite);

    if (pendingWrite) {
      await pendingWrite.catch(() => undefined);
    }

    return retryTransientFileOperation(
      async () => {
        const raw = await fs.readFile(targetPath, "utf8");
        return JSON.parse(raw) as T;
      },
      (error) => shouldRetryRead(error, { hadPendingWrite }),
    );
  }

  async writeJsonAtomic(targetPath: string, value: unknown): Promise<void> {
    const queueKey = this.getQueueKey(targetPath);
    const previous = this.writeQueues.get(queueKey) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(() => this.writeJsonAtomicWithRetry(targetPath, value));
    const tail = operation
      .catch(() => undefined)
      .finally(() => {
        if (this.writeQueues.get(queueKey) === tail) {
          this.writeQueues.delete(queueKey);
        }
      });

    this.writeQueues.set(queueKey, tail);
    await operation;
  }

  async moveFile(currentPath: string, nextPath: string): Promise<void> {
    await this.ensureDirectory(path.dirname(nextPath));
    await fs.rename(currentPath, nextPath);
  }

  private async writeJsonAtomicWithRetry(
    targetPath: string,
    value: unknown,
  ): Promise<void> {
    await this.ensureDirectory(path.dirname(targetPath));

    try {
      await retryTransientFileOperation(async () => {
        await writeFileAtomic(
          targetPath,
          `${JSON.stringify(value, null, 2)}\n`,
          {
            encoding: "utf8",
          },
        );
      }, shouldRetryWrite);
    } catch (error) {
      await this.cleanupAtomicTempFiles(targetPath);
      throw error;
    }
  }

  private async cleanupAtomicTempFiles(targetPath: string): Promise<void> {
    const directory = path.dirname(targetPath);
    const baseName = path
      .basename(targetPath)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tempFilePattern = new RegExp(`^${baseName}\\.\\d+$`);

    try {
      const entries = await fs.readdir(directory);
      await Promise.all(
        entries
          .filter((entry) => tempFilePattern.test(entry))
          .map((entry) => fs.rm(path.join(directory, entry), { force: true })),
      );
    } catch {
      // Temp cleanup is best-effort; the original write error is more useful.
    }
  }

  private getQueueKey(targetPath: string): string {
    const resolved = path.resolve(targetPath);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }
}

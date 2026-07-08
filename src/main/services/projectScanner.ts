import path from "node:path";

import type { BulkImportCandidate, DetectionResult } from "../types/shared";
import { FileSystemService } from "./fileSystemService";
import { ProjectDetector } from "./projectDetector";

const INSPECTED_FILES = ["package.json", "main.py", "app.py"];

export class ProjectScanner {
  constructor(
    private readonly fileSystemService: FileSystemService,
    private readonly projectDetector: ProjectDetector,
  ) {}

  async scanFolder(projectPath: string): Promise<DetectionResult> {
    const absolutePath = path.resolve(projectPath);
    const exists = await this.fileSystemService.exists(absolutePath);

    if (!exists || !(await this.fileSystemService.isDirectory(absolutePath))) {
      throw new Error("The selected folder could not be found.");
    }

    const entries = await this.fileSystemService.listDirectory(absolutePath);
    const entryKinds = Object.fromEntries(
      entries.map(
        (entry) =>
          [entry.name, entry.isDirectory ? "directory" : "file"] as const,
      ),
    );

    const fileContents = Object.fromEntries(
      await Promise.all(
        INSPECTED_FILES.map(async (filename) => [
          filename,
          await this.fileSystemService.readTextFile(
            path.join(absolutePath, filename),
          ),
        ]),
      ),
    );

    let packageJson: Record<string, unknown> | undefined;

    if (fileContents["package.json"]) {
      try {
        packageJson = JSON.parse(fileContents["package.json"]) as Record<
          string,
          unknown
        >;
      } catch {
        packageJson = undefined;
      }
    }

    return this.projectDetector.detect({
      rootPath: absolutePath,
      entries: entries.map((entry) => entry.name),
      entryKinds,
      fileContents,
      packageJson,
    });
  }

  async scanWorkspace(parentPath: string): Promise<BulkImportCandidate[]> {
    const absolutePath = path.resolve(parentPath);
    const exists = await this.fileSystemService.exists(absolutePath);

    if (!exists || !(await this.fileSystemService.isDirectory(absolutePath))) {
      throw new Error("The selected workspace folder could not be found.");
    }

    const entries = await this.fileSystemService.listDirectory(absolutePath);
    const candidatePaths = [absolutePath].concat(
      entries
        .filter((entry) => entry.isDirectory && !entry.name.startsWith("."))
        .map((entry) => path.join(absolutePath, entry.name)),
    );

    const results = await Promise.allSettled(
      candidatePaths.map(async (candidatePath) => {
        const detection = await this.scanFolder(candidatePath);

        if (detection.detectedType === "unknown") {
          return null;
        }

        return {
          name: path.basename(candidatePath),
          path: candidatePath,
          detection,
        } satisfies BulkImportCandidate;
      }),
    );

    return results
      .flatMap((result) =>
        result.status === "fulfilled" && result.value ? [result.value] : [],
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }
}

import path from "node:path";

import {
  ProjectTerminalSessionSchema,
  type ProjectTerminalSession,
} from "../types/shared";
import { FileSystemService } from "./fileSystemService";
import { SerialTaskQueue } from "../../shared/serialTaskQueue";

export class TerminalSessionStore {
  private readonly filePath: string;
  private readonly tasks = new SerialTaskQueue();

  constructor(
    private readonly fileSystemService: FileSystemService,
    userDataPath: string,
  ) {
    this.filePath = path.join(userDataPath, "project-terminal-sessions.json");
  }

  async getSessions(): Promise<ProjectTerminalSession[]> {
    return this.tasks.run(() => this.loadSessions());
  }

  private async loadSessions(): Promise<ProjectTerminalSession[]> {
    try {
      const raw = await this.fileSystemService.readJsonFile<unknown>(
        this.filePath,
      );
      const parsed = ProjectTerminalSessionSchema.array().safeParse(raw);

      if (parsed.success) {
        return parsed.data;
      }

      if (Array.isArray(raw)) {
        const repaired = raw.flatMap((entry) => {
          const result = ProjectTerminalSessionSchema.safeParse(entry);
          return result.success ? [result.data] : [];
        });
        await this.persist(repaired);
        return repaired;
      }

      await this.persist([]);
      return [];
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        await this.persist([]);
        return [];
      }

      if (error instanceof SyntaxError) {
        await this.backupCorruptFile();
        await this.persist([]);
        return [];
      }

      throw error;
    }
  }

  async upsertSession(
    session: ProjectTerminalSession,
  ): Promise<ProjectTerminalSession> {
    return this.tasks.run(() => this.upsertSessionInternal(session));
  }

  private async upsertSessionInternal(session: ProjectTerminalSession): Promise<ProjectTerminalSession> {
    const parsed = ProjectTerminalSessionSchema.parse(session);
    const sessions = await this.loadSessions();
    const next = [
      parsed,
      ...sessions.filter((entry) => entry.projectId !== parsed.projectId),
    ];
    await this.persist(next);
    return parsed;
  }

  async updateSession(
    projectId: string,
    patch: Partial<Omit<ProjectTerminalSession, "projectId" | "createdAt">>,
  ): Promise<ProjectTerminalSession | null> {
    return this.tasks.run(async () => {
    const sessions = await this.loadSessions();
    const current = sessions.find((entry) => entry.projectId === projectId);

    if (!current) {
      return null;
    }

    const next = ProjectTerminalSessionSchema.parse({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    await this.upsertSessionInternal(next);
    return next;
    });
  }

  async clearSession(projectId: string): Promise<void> {
    return this.tasks.run(async () => {
    const sessions = await this.loadSessions();
    await this.persist(
      sessions.filter((entry) => entry.projectId !== projectId),
    );
    });
  }

  private async persist(sessions: ProjectTerminalSession[]): Promise<void> {
    await this.fileSystemService.writeJsonAtomic(this.filePath, sessions);
  }

  private async backupCorruptFile(): Promise<void> {
    if (!(await this.fileSystemService.exists(this.filePath))) {
      return;
    }

    const backupPath = `${this.filePath}.${Date.now()}.corrupt`;
    await this.fileSystemService.moveFile(this.filePath, backupPath);
  }
}

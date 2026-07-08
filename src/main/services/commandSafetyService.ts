import { createHash } from "node:crypto";
import path from "node:path";

import { z } from "zod";

import type {
  CommandSafetySummary,
  LaunchCommand,
  Project,
} from "../types/shared";
import { CommandSafetySummarySchema } from "../types/shared";
import { FileSystemService } from "./fileSystemService";

export const commandRiskValues = ["safe", "medium", "dangerous"] as const;
export type CommandRisk = (typeof commandRiskValues)[number];

export type CommandApprovalOptions = {
  approvedCommandIds?: string[];
  dangerousOverride?: boolean;
};

type CommandSafetyContext = {
  project: Project;
  command: LaunchCommand;
};

const CommandApprovalRecordSchema = z.object({
  fingerprint: z.string().min(1),
  projectId: z.string().min(1),
  commandId: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().min(1),
  risk: z.enum(commandRiskValues),
  approvedAt: z.string().min(1),
});

const CommandApprovalsSchema = z.array(CommandApprovalRecordSchema).default([]);

type CommandApprovalRecord = z.infer<typeof CommandApprovalRecordSchema>;

const dangerousPatterns: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bsudo\s+rm\b/i,
  /\bdel\s+\/[sq]\b/i,
  /\brmdir\s+\/s\b/i,
  /\bformat\b/i,
  /\bpowershell(?:\.exe)?\s+-enc(?:odedcommand)?\b/i,
  /\b(?:curl|wget)\b.+\|\s*(?:bash|sh|powershell|pwsh)\b/i,
  /\bchmod\s+777\b/i,
  /\bgit\s+(?:clean\s+-fd|reset\s+--hard)\b/i,
];

const mediumPatterns: RegExp[] = [
  /\bsudo\b/i,
  /\b(?:npm|pnpm|yarn|bun)\s+(?:install|i)\b/i,
  /\bdocker\s+compose\s+(?:up|down)\b/i,
  /\bdocker\s+(?:run|rm|rmi|system\s+prune)\b/i,
  /\bprisma\s+migrate\b/i,
  /\b(?:drop|truncate)\s+table\b/i,
  /\.env\b/i,
  /\b(?:private|secret|token|key)\b/i,
];

export class CommandSafetyError extends Error {
  constructor(
    message: string,
    readonly risk: CommandRisk,
    readonly code: "command_unapproved" | "command_dangerous",
  ) {
    super(message);
    this.name = "CommandSafetyError";
  }
}

export class CommandSafetyService {
  private readonly filePath: string;

  constructor(
    private readonly fileSystemService: FileSystemService,
    userDataPath: string,
  ) {
    this.filePath = path.join(userDataPath, "command-approvals.json");
  }

  classifyCommand(command: string): CommandRisk {
    const normalized = command.trim();

    if (dangerousPatterns.some((pattern) => pattern.test(normalized))) {
      return "dangerous";
    }

    if (mediumPatterns.some((pattern) => pattern.test(normalized))) {
      return "medium";
    }

    return "safe";
  }

  async ensureCommandsAllowed(
    commands: CommandSafetyContext[],
    options: CommandApprovalOptions = {},
  ): Promise<void> {
    if (commands.length === 0) {
      return;
    }

    const approvals = await this.loadApprovals();
    const approvedFingerprints = new Set(
      approvals.map((record) => record.fingerprint),
    );
    const approvedCommandIds = new Set(options.approvedCommandIds ?? []);
    const approvalsToPersist: CommandApprovalRecord[] = [];

    for (const context of commands) {
      const risk = this.classifyCommand(context.command.command);
      const fingerprint = this.fingerprint(context.project.id, context.command);
      const hasStoredApproval = approvedFingerprints.has(fingerprint);
      const hasFreshApproval = approvedCommandIds.has(context.command.id);

      if (
        risk === "dangerous" &&
        !options.dangerousOverride &&
        !hasStoredApproval
      ) {
        throw new CommandSafetyError(
          `Projecto blocked a dangerous command until you explicitly review it: ${context.command.command}`,
          risk,
          "command_dangerous",
        );
      }

      if (!hasStoredApproval && !hasFreshApproval) {
        throw new CommandSafetyError(
          `Review this command once before Projecto can run it: ${context.command.command}`,
          risk,
          "command_unapproved",
        );
      }

      if (!hasStoredApproval && hasFreshApproval) {
        approvalsToPersist.push({
          fingerprint,
          projectId: context.project.id,
          commandId: context.command.id,
          command: context.command.command,
          cwd: context.command.cwd,
          risk,
          approvedAt: new Date().toISOString(),
        });
      }
    }

    if (approvalsToPersist.length > 0) {
      await this.persistApprovals([...approvals, ...approvalsToPersist]);
    }
  }

  async getCommandSafety(project: Project): Promise<CommandSafetySummary[]> {
    const approvals = await this.loadApprovals();
    const approvedFingerprints = new Set(
      approvals.map((record) => record.fingerprint),
    );

    return project.commands.map((command) =>
      CommandSafetySummarySchema.parse({
        commandId: command.id,
        label: command.label,
        command: command.command,
        cwd: command.cwd,
        risk: this.classifyCommand(command.command),
        approved: approvedFingerprints.has(
          this.fingerprint(project.id, command),
        ),
      }),
    );
  }

  async resetApprovals(): Promise<void> {
    await this.persistApprovals([]);
  }

  private fingerprint(projectId: string, command: LaunchCommand): string {
    return createHash("sha256")
      .update(projectId)
      .update("\0")
      .update(command.command)
      .update("\0")
      .update(command.cwd)
      .digest("hex");
  }

  private async loadApprovals(): Promise<CommandApprovalRecord[]> {
    try {
      const raw = await this.fileSystemService.readJsonFile<unknown>(
        this.filePath,
      );
      return CommandApprovalsSchema.parse(raw);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (
        code === "ENOENT" ||
        error instanceof SyntaxError ||
        error instanceof z.ZodError
      ) {
        await this.persistApprovals([]);
        return [];
      }

      throw error;
    }
  }

  private async persistApprovals(
    records: CommandApprovalRecord[],
  ): Promise<void> {
    await this.fileSystemService.writeJsonAtomic(this.filePath, records);
  }
}

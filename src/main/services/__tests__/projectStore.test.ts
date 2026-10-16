import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileSystemService } from "../fileSystemService";
import { ProjectStore } from "../projectStore";
import { DesktopApiError } from "../subscriptionService";

const tempDirs: string[] = [];

async function createUserDataDir(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "projecto-store-"));
  tempDirs.push(directory);
  return directory;
}

async function createWorkspace(name: string): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), `projecto-workspace-${name}-`),
  );
  tempDirs.push(directory);
  return directory;
}

function remoteProject(
  id: string,
  workspace: string,
  overrides?: Partial<{
    name: string;
    detectionSummary: string;
    createdAt: string;
    updatedAt: string;
    lastLaunchedAt: string | null;
  }>,
) {
  return {
    id,
    userId: "user-1",
    name: overrides?.name ?? id,
    directoryPath: workspace,
    detectionLevel: "basic",
    detectionSummary: overrides?.detectionSummary ?? "Vite",
    themeMode: "dark",
    themePreset: null,
    createdAt: overrides?.createdAt ?? "2026-04-25T07:00:00.000Z",
    updatedAt: overrides?.updatedAt ?? "2026-04-25T07:30:00.000Z",
    lastLaunchedAt: overrides?.lastLaunchedAt ?? null,
  };
}

function localDetails(
  id: string,
  workspace: string,
  launchCount: number,
  overrides?: Partial<{
    name: string;
    localUpdatedAt: string;
  }>,
) {
  return {
    id,
    path: workspace,
    detectedType: "node",
    framework: "Vite",
    packageManager: "npm",
    detectedFiles: ["package.json"],
    suggestedCommands: [
      {
        label: "Development server",
        command: "npm run dev",
        cwd: workspace,
      },
    ],
    suggestedBrowserUrls: ["http://localhost:5173"],
    launchProfiles: [],
    commands: [],
    notes: "",
    favorite: false,
    launchCount,
    localUpdatedAt:
      overrides?.localUpdatedAt ?? "2026-04-25T08:00:00.000Z",
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("ProjectStore", () => {
  const subscriptionService = {
    getSubscriptionState: vi.fn(),
    postAuthenticatedJson: vi.fn(),
    applyRemoteSubscriptionSnapshot: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionService.getSubscriptionState.mockResolvedValue({
      plan: "free",
      status: "none",
      entitlements: {
        maxProjects: 5,
        canChangeProjectDirectories: true,
        maxConcurrentLaunches: 1,
        canBulkImport: false,
        canBulkScan: false,
        projectStorage: "firestore",
        requiresOnline: true,
        projectDetectionLevel: "basic",
        defaultDirectoryLimit: 5,
        canChangeDefaultDirectories: true,
      },
    });
    subscriptionService.applyRemoteSubscriptionSnapshot.mockResolvedValue(
      undefined,
    );
  });

  it("creates remote-backed projects and persists local launch details", async () => {
    const userDataDir = await createUserDataDir();
    const workspace = await createWorkspace("create");
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );

    subscriptionService.postAuthenticatedJson
      .mockResolvedValueOnce({
        projects: [],
        archivedProjects: [],
        subscription: {
          plan: "free",
          status: "none",
        },
      })
      .mockResolvedValueOnce({
        project: {
          id: "remote-1",
          userId: "user-1",
          name: "Workspace",
          directoryPath: workspace,
          detectionLevel: "basic",
          detectionSummary: "Vite",
          themeMode: "dark",
          themePreset: null,
          createdAt: "2026-04-25T09:00:00.000Z",
          updatedAt: "2026-04-25T09:00:00.000Z",
          lastLaunchedAt: null,
        },
        subscription: {
          plan: "free",
          status: "none",
        },
      });

    const project = await store.createProject({
      name: "Workspace",
      path: workspace,
      detectedType: "node",
      framework: "Vite",
      packageManager: "npm",
      detectedFiles: ["package.json"],
      suggestedCommands: [
        {
          label: "Install dependencies",
          command: "npm install",
          cwd: workspace,
        },
        { label: "Development server", command: "npm run dev", cwd: workspace },
      ],
      suggestedBrowserUrls: ["http://localhost:5173"],
    });

    expect(project.id).toBe("remote-1");
    expect(project.launchProfiles[0]?.commandIds).toHaveLength(1);
    expect(project.missingFolder).toBe(false);

    const detailsContents = await fs.readFile(
      path.join(userDataDir, "project-details.json"),
      "utf8",
    );
    expect(JSON.parse(detailsContents)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "remote-1",
          path: workspace,
          framework: "Vite",
          launchProfiles: expect.any(Array),
        }),
      ]),
    );
  });

  it("skips duplicate and already synced paths before remote bulk import", async () => {
    const userDataDir = await createUserDataDir();
    const existingWorkspace = await createWorkspace("bulk-existing");
    const newWorkspace = await createWorkspace("bulk-new");
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );

    subscriptionService.getSubscriptionState.mockResolvedValue({
      plan: "pro",
      status: "active",
      entitlements: {
        maxProjects: null,
        canChangeProjectDirectories: true,
        maxConcurrentLaunches: null,
        canBulkImport: true,
        canBulkScan: true,
        projectStorage: "firestore",
        requiresOnline: true,
        projectDetectionLevel: "advanced",
        defaultDirectoryLimit: null,
        canChangeDefaultDirectories: true,
      },
    });
    subscriptionService.postAuthenticatedJson
      .mockResolvedValueOnce({
        projects: [remoteProject("existing-1", existingWorkspace)],
        archivedProjects: [],
        subscription: {
          plan: "pro",
          status: "active",
        },
      })
      .mockResolvedValueOnce({
        projects: [
          remoteProject("bulk-new-1", newWorkspace, {
            name: "Bulk New",
          }),
        ],
        subscription: {
          plan: "pro",
          status: "active",
        },
      });

    const imported = await store.bulkImportProjects([
      {
        name: "Existing",
        path: existingWorkspace,
        detectedType: "node",
        detectedFiles: [],
        suggestedCommands: [],
        suggestedBrowserUrls: [],
      },
      {
        name: "Bulk New",
        path: newWorkspace,
        detectedType: "node",
        detectedFiles: [],
        suggestedCommands: [],
        suggestedBrowserUrls: [],
      },
      {
        name: "Bulk New Duplicate",
        path: `${newWorkspace}${path.sep}`,
        detectedType: "node",
        detectedFiles: [],
        suggestedCommands: [],
        suggestedBrowserUrls: [],
      },
    ]);

    expect(imported).toHaveLength(1);
    expect(imported[0]?.id).toBe("bulk-new-1");
    expect(subscriptionService.postAuthenticatedJson).toHaveBeenNthCalledWith(
      2,
      "/api/desktop/projects/bulk-import",
      {
        projects: [
          expect.objectContaining({
            name: "Bulk New",
            directoryPath: path.resolve(newWorkspace),
            detectionLevel: "advanced",
          }),
        ],
      },
    );
  });

  it("hydrates synced remote projects and derives missing folder state", async () => {
    const userDataDir = await createUserDataDir();
    const workspace = await createWorkspace("sync");
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );

    await fs.writeFile(
      path.join(userDataDir, "project-details.json"),
      JSON.stringify(
        [
          {
            id: "remote-1",
            path: workspace,
            detectedType: "node",
            framework: "Next.js",
            packageManager: "pnpm",
            detectedFiles: ["package.json", "next.config.mjs"],
            suggestedCommands: [
              { label: "Dev server", command: "pnpm dev", cwd: workspace },
            ],
            suggestedBrowserUrls: ["http://localhost:3000"],
            launchProfiles: [],
            commands: [],
            notes: "hello",
            favorite: true,
            launchCount: 2,
            localUpdatedAt: "2026-04-25T08:00:00.000Z",
          },
        ],
        null,
        2,
      ),
      "utf8",
    );

    subscriptionService.postAuthenticatedJson.mockResolvedValueOnce({
      projects: [
        {
          id: "remote-1",
          userId: "user-1",
          name: "Workspace",
          directoryPath: workspace,
          detectionLevel: "basic",
          detectionSummary: "Next.js",
          themeMode: "dark",
          themePreset: null,
          createdAt: "2026-04-25T07:00:00.000Z",
          updatedAt: "2026-04-25T07:30:00.000Z",
          lastLaunchedAt: "2026-04-25T09:30:00.000Z",
        },
      ],
      subscription: {
        plan: "free",
        status: "none",
      },
    });

    await fs.rm(workspace, { recursive: true, force: true });

    const projects = await store.getProjects();

    expect(projects).toEqual([
      expect.objectContaining({
        id: "remote-1",
        framework: "Next.js",
        favorite: true,
        missingFolder: true,
        lastOpenedAt: "2026-04-25T09:30:00.000Z",
      }),
    ]);
    expect(projects[0]?.commands).toEqual([
      expect.objectContaining({
        command: "pnpm dev",
        runOnLaunch: true,
      }),
    ]);
    expect(projects[0]?.launchProfiles[0]?.commandIds).toHaveLength(1);
  });

  it("preserves explicitly disabled commands when repairing imported profiles", async () => {
    const userDataDir = await createUserDataDir();
    const workspace = await createWorkspace("repair");
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );

    await fs.writeFile(
      path.join(userDataDir, "project-details.json"),
      JSON.stringify(
        [
          {
            id: "remote-1",
            path: workspace,
            detectedType: "node",
            framework: "Vite",
            packageManager: "npm",
            detectedFiles: ["package.json"],
            suggestedCommands: [
              {
                label: "Development server",
                command: "npm run dev",
                cwd: workspace,
              },
            ],
            suggestedBrowserUrls: ["http://localhost:5173"],
            launchProfiles: [
              {
                id: "profile-1",
                name: "Default Launch",
                openEditor: true,
                openFolder: false,
                openBrowser: true,
                browserUrls: [],
                commandIds: [],
                askBeforeRun: true,
              },
            ],
            commands: [
              {
                id: "command-1",
                label: "Development server",
                command: "npm run dev",
                cwd: workspace,
                runOnLaunch: false,
              },
            ],
            notes: "",
            favorite: false,
            launchCount: 0,
            localUpdatedAt: "2026-04-25T08:00:00.000Z",
          },
        ],
        null,
        2,
      ),
      "utf8",
    );

    subscriptionService.postAuthenticatedJson.mockResolvedValueOnce({
      projects: [
        {
          id: "remote-1",
          userId: "user-1",
          name: "Workspace",
          directoryPath: workspace,
          detectionLevel: "basic",
          detectionSummary: "Vite",
          themeMode: "dark",
          themePreset: null,
          createdAt: "2026-04-25T07:00:00.000Z",
          updatedAt: "2026-04-25T07:30:00.000Z",
          lastLaunchedAt: null,
        },
      ],
      subscription: {
        plan: "free",
        status: "none",
      },
    });

    const projects = await store.getProjects();

    expect(projects[0]?.commands[0]?.runOnLaunch).toBe(false);
    expect(projects[0]?.launchProfiles[0]?.commandIds).toEqual([]);
    expect(projects[0]?.launchProfiles[0]?.browserUrls).toEqual([]);
  });

  it("preserves explicitly disabled Python commands without synthesizing a profile", async () => {
    const userDataDir = await createUserDataDir();
    const workspace = await createWorkspace("repair-python");
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );

    await fs.writeFile(
      path.join(userDataDir, "project-details.json"),
      JSON.stringify(
        [
          {
            id: "python-1",
            path: workspace,
            detectedType: "python",
            framework: "Python",
            packageManager: "uv",
            detectedFiles: ["main.py", "pyproject.toml"],
            suggestedCommands: [
              {
                label: "Install dependencies",
                command: "uv sync",
                cwd: workspace,
              },
              {
                label: "Run app",
                command: "uv run python main.py",
                cwd: workspace,
              },
            ],
            suggestedBrowserUrls: [],
            launchProfiles: [],
            commands: [
              {
                id: "install-1",
                label: "Install dependencies",
                command: "uv sync",
                cwd: workspace,
                runOnLaunch: false,
              },
              {
                id: "run-1",
                label: "Run app",
                command: "uv run python main.py",
                cwd: workspace,
                runOnLaunch: false,
              },
            ],
            notes: "",
            favorite: false,
            launchCount: 0,
            localUpdatedAt: "2026-04-25T08:00:00.000Z",
          },
        ],
        null,
        2,
      ),
      "utf8",
    );

    subscriptionService.postAuthenticatedJson.mockResolvedValueOnce({
      projects: [
        remoteProject("python-1", workspace, {
          name: "Python App",
          detectionSummary: "Python",
        }),
      ],
      subscription: {
        plan: "free",
        status: "none",
      },
    });

    const projects = await store.getProjects();

    expect(projects[0]?.commands).toEqual([
      expect.objectContaining({
        id: "install-1",
        runOnLaunch: false,
      }),
      expect.objectContaining({
        id: "run-1",
        runOnLaunch: false,
      }),
    ]);
    expect(projects[0]?.launchProfiles).toEqual([]);
  });

  it("falls back to local project details when the remote project list endpoint is unavailable", async () => {
    const userDataDir = await createUserDataDir();
    const workspace = await createWorkspace("local-fallback");
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );

    await fs.writeFile(
      path.join(userDataDir, "project-details.json"),
      JSON.stringify(
        [
          {
            id: "remote-1",
            path: workspace,
            detectedType: "node",
            framework: "Vite",
            packageManager: "npm",
            detectedFiles: ["package.json"],
            suggestedCommands: [
              {
                label: "Development server",
                command: "npm run dev",
                cwd: workspace,
              },
            ],
            suggestedBrowserUrls: ["http://localhost:5173"],
            launchProfiles: [],
            commands: [],
            notes: "local survives a cloud read outage",
            favorite: true,
            launchCount: 3,
            localUpdatedAt: "2026-04-25T08:00:00.000Z",
          },
        ],
        null,
        2,
      ),
      "utf8",
    );
    subscriptionService.postAuthenticatedJson.mockRejectedValueOnce(
      new DesktopApiError("Not Found", 404),
    );

    const projects = await store.getProjects();

    expect(projects).toEqual([
      expect.objectContaining({
        id: "remote-1",
        name: path.basename(workspace),
        framework: "Vite",
        favorite: true,
        launchCount: 3,
        missingFolder: false,
        notes: "local survives a cloud read outage",
      }),
    ]);
    expect(projects[0]?.commands[0]).toEqual(
      expect.objectContaining({
        command: "npm run dev",
        runOnLaunch: true,
      }),
    );
    expect(projects[0]?.launchProfiles[0]?.commandIds).toHaveLength(1);
    expect(
      subscriptionService.applyRemoteSubscriptionSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("hydrates active and archived projects and locks only Free projects beyond the top five by usage", async () => {
    const userDataDir = await createUserDataDir();
    const workspaces = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        createWorkspace(`free-rank-${index + 1}`),
      ),
    );
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );
    const ids = [
      "active-high",
      "active-recent",
      "active-mid",
      "active-low",
      "active-zero",
      "archived-most",
    ];

    await fs.writeFile(
      path.join(userDataDir, "project-details.json"),
      JSON.stringify(
        ids.map((id, index) =>
          localDetails(id, workspaces[index]!, [8, 8, 4, 1, 0, 20][index]!),
        ),
        null,
        2,
      ),
      "utf8",
    );

    subscriptionService.postAuthenticatedJson.mockResolvedValueOnce({
      projects: ids.slice(0, 5).map((id, index) =>
        remoteProject(id, workspaces[index]!, {
          name: id,
          lastLaunchedAt:
            id === "active-recent"
              ? "2026-04-25T12:00:00.000Z"
              : "2026-04-25T09:00:00.000Z",
        }),
      ),
      archivedProjects: [
        remoteProject("archived-most", workspaces[5]!, {
          name: "archived-most",
          lastLaunchedAt: "2026-04-25T06:00:00.000Z",
        }),
      ],
      subscription: {
        plan: "free",
        status: "none",
      },
    });

    const projects = await store.getProjects();
    const byId = new Map(projects.map((project) => [project.id, project]));
    const lockedProjects = projects.filter(
      (project) => project.lockedBySubscription,
    );

    expect(projects).toHaveLength(6);
    expect(lockedProjects).toHaveLength(1);
    expect(byId.get("active-zero")).toEqual(
      expect.objectContaining({
        lockedBySubscription: true,
        subscriptionRank: 6,
        subscriptionLimit: 5,
        subscriptionLockReason: "free_project_limit",
      }),
    );
    expect(byId.get("archived-most")).toEqual(
      expect.objectContaining({
        lockedBySubscription: false,
        subscriptionRank: 1,
        subscriptionLimit: 5,
      }),
    );
    expect(byId.get("active-recent")?.subscriptionRank).toBeLessThan(
      byId.get("active-high")?.subscriptionRank ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("uses deterministic project names and ids when Free usage counts tie", async () => {
    const userDataDir = await createUserDataDir();
    const workspaces = await Promise.all(
      ["Alpha", "Beta", "Delta", "Gamma", "Omega", "Zeta"].map((name) =>
        createWorkspace(`free-tie-${name}`),
      ),
    );
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );
    const names = ["Alpha", "Beta", "Delta", "Gamma", "Omega", "Zeta"];

    await fs.writeFile(
      path.join(userDataDir, "project-details.json"),
      JSON.stringify(
        names.map((name, index) =>
          localDetails(`project-${name}`, workspaces[index]!, 1, {
            localUpdatedAt: "2026-04-25T08:00:00.000Z",
          }),
        ),
        null,
        2,
      ),
      "utf8",
    );

    subscriptionService.postAuthenticatedJson.mockResolvedValueOnce({
      projects: names.map((name, index) =>
        remoteProject(`project-${name}`, workspaces[index]!, {
          name,
          createdAt: "2026-04-25T07:00:00.000Z",
          updatedAt: "2026-04-25T07:00:00.000Z",
          lastLaunchedAt: "2026-04-25T09:00:00.000Z",
        }),
      ),
      archivedProjects: [],
      subscription: {
        plan: "free",
        status: "none",
      },
    });

    const projects = await store.getProjects();
    const byId = new Map(projects.map((project) => [project.id, project]));

    expect(byId.get("project-Alpha")?.subscriptionRank).toBe(1);
    expect(byId.get("project-Omega")?.subscriptionRank).toBe(5);
    expect(byId.get("project-Zeta")).toEqual(
      expect.objectContaining({
        lockedBySubscription: true,
        subscriptionRank: 6,
      }),
    );
  });

  it("unlocks every project for active Pro access", async () => {
    const userDataDir = await createUserDataDir();
    const workspaces = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        createWorkspace(`pro-unlock-${index + 1}`),
      ),
    );
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );
    subscriptionService.getSubscriptionState.mockResolvedValue({
      plan: "pro",
      status: "active",
      entitlements: {
        maxProjects: null,
        canChangeProjectDirectories: true,
        maxConcurrentLaunches: null,
        canBulkImport: true,
        canBulkScan: true,
        projectStorage: "firestore",
        requiresOnline: true,
        projectDetectionLevel: "advanced",
        defaultDirectoryLimit: null,
        canChangeDefaultDirectories: true,
      },
    });
    await fs.writeFile(
      path.join(userDataDir, "project-details.json"),
      JSON.stringify(
        workspaces.map((workspace, index) =>
          localDetails(`project-${index + 1}`, workspace, index),
        ),
        null,
        2,
      ),
      "utf8",
    );
    subscriptionService.postAuthenticatedJson.mockResolvedValueOnce({
      projects: workspaces.map((workspace, index) =>
        remoteProject(`project-${index + 1}`, workspace),
      ),
      archivedProjects: [],
      subscription: {
        plan: "pro",
        status: "active",
      },
    });

    const projects = await store.getProjects();

    expect(projects).toHaveLength(6);
    expect(projects.every((project) => !project.lockedBySubscription)).toBe(
      true,
    );
    expect(projects.every((project) => project.subscriptionRank === undefined))
      .toBe(true);
  });

  it("blocks Free project creation at five visible projects and allows it below five", async () => {
    const blockedUserDataDir = await createUserDataDir();
    const blockedWorkspaces = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createWorkspace(`create-blocked-${index + 1}`),
      ),
    );
    const blockedStore = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      blockedUserDataDir,
    );
    subscriptionService.postAuthenticatedJson.mockResolvedValueOnce({
      projects: blockedWorkspaces.map((workspace, index) =>
        remoteProject(`blocked-${index + 1}`, workspace),
      ),
      archivedProjects: [],
      subscription: {
        plan: "free",
        status: "none",
      },
    });

    await expect(
      blockedStore.createProject({
        name: "Blocked",
        path: blockedWorkspaces[0]!,
        detectedType: "node",
        detectedFiles: [],
        suggestedCommands: [],
        suggestedBrowserUrls: [],
      }),
    ).rejects.toThrow("UPGRADE_REQUIRED:projects");

    const allowedUserDataDir = await createUserDataDir();
    const allowedWorkspace = await createWorkspace("create-allowed");
    const allowedStore = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      allowedUserDataDir,
    );
    subscriptionService.postAuthenticatedJson
      .mockResolvedValueOnce({
        projects: [],
        archivedProjects: [],
        subscription: {
          plan: "free",
          status: "none",
        },
      })
      .mockResolvedValueOnce({
        project: remoteProject("allowed-1", allowedWorkspace, {
          name: "Allowed",
        }),
        subscription: {
          plan: "free",
          status: "none",
        },
      });

    const created = await allowedStore.createProject({
      name: "Allowed",
      path: allowedWorkspace,
      detectedType: "node",
      detectedFiles: [],
      suggestedCommands: [],
      suggestedBrowserUrls: [],
    });

    expect(created.id).toBe("allowed-1");
  });

  it("allows deleting projects that are locked by the Free project limit", async () => {
    const userDataDir = await createUserDataDir();
    const workspaces = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        createWorkspace(`delete-locked-${index + 1}`),
      ),
    );
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );
    await fs.writeFile(
      path.join(userDataDir, "project-details.json"),
      JSON.stringify(
        workspaces.map((workspace, index) =>
          localDetails(`project-${index + 1}`, workspace, 6 - index),
        ),
        null,
        2,
      ),
      "utf8",
    );
    subscriptionService.postAuthenticatedJson
      .mockResolvedValueOnce({
        projects: workspaces.map((workspace, index) =>
          remoteProject(`project-${index + 1}`, workspace, {
            name: `Project ${index + 1}`,
          }),
        ),
        archivedProjects: [],
        subscription: {
          plan: "free",
          status: "none",
        },
      })
      .mockResolvedValueOnce({
        projectId: "project-6",
      });

    const projects = await store.getProjects();
    expect(
      projects.find((project) => project.id === "project-6")
        ?.lockedBySubscription,
    ).toBe(true);

    await store.deleteProject("project-6");

    const detailsContents = await fs.readFile(
      path.join(userDataDir, "project-details.json"),
      "utf8",
    );
    expect(JSON.parse(detailsContents)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "project-6" })]),
    );
  });

  it("updates local details, syncs remote metadata, and deletes synced projects", async () => {
    const userDataDir = await createUserDataDir();
    const workspace = await createWorkspace("update");
    const nextWorkspace = await createWorkspace("update-next");
    const store = new ProjectStore(
      new FileSystemService(),
      subscriptionService as never,
      userDataDir,
    );

    await fs.writeFile(
      path.join(userDataDir, "project-details.json"),
      JSON.stringify(
        [
          {
            id: "remote-1",
            path: workspace,
            detectedType: "python",
            detectedFiles: ["main.py"],
            suggestedCommands: [],
            suggestedBrowserUrls: [],
            launchProfiles: [],
            commands: [],
            notes: "",
            favorite: false,
            launchCount: 0,
            localUpdatedAt: "2026-04-25T08:00:00.000Z",
          },
        ],
        null,
        2,
      ),
      "utf8",
    );

    subscriptionService.postAuthenticatedJson
      .mockResolvedValueOnce({
        projects: [
          {
            id: "remote-1",
            userId: "user-1",
            name: "Workspace",
            directoryPath: workspace,
            detectionLevel: "basic",
            detectionSummary: "Python",
            themeMode: "dark",
            themePreset: null,
            createdAt: "2026-04-25T07:00:00.000Z",
            updatedAt: "2026-04-25T07:30:00.000Z",
            lastLaunchedAt: null,
          },
        ],
        subscription: {
          plan: "free",
          status: "none",
        },
      })
      .mockResolvedValueOnce({
        project: {
          id: "remote-1",
          userId: "user-1",
          name: "Workspace Updated",
          directoryPath: nextWorkspace,
          detectionLevel: "basic",
          detectionSummary: "Python",
          themeMode: "dark",
          themePreset: null,
          createdAt: "2026-04-25T07:00:00.000Z",
          updatedAt: "2026-04-25T10:30:00.000Z",
          lastLaunchedAt: null,
        },
        subscription: {
          plan: "pro",
          status: "active",
        },
      })
      .mockResolvedValueOnce({
        projectId: "remote-1",
      });

    const updated = await store.updateProject("remote-1", {
      name: "Workspace Updated",
      path: nextWorkspace,
      notes: "updated",
      favorite: true,
    });

    expect(updated.name).toBe("Workspace Updated");
    expect(updated.path).toBe(nextWorkspace);
    expect(updated.notes).toBe("updated");
    expect(updated.favorite).toBe(true);

    await store.deleteProject("remote-1");

    const detailsContents = await fs.readFile(
      path.join(userDataDir, "project-details.json"),
      "utf8",
    );
    expect(JSON.parse(detailsContents)).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project, RunEvent } from "../../types/shared";
import { useProjectsStore } from "../../../renderer/store/useProjectsStore";
import { useLogsStore } from "../../../renderer/store/useLogsStore";

afterEach(() => {
  useProjectsStore.getState().resetProjects();
  useLogsStore.getState().clearAll();
  vi.unstubAllGlobals();
});

describe("renderer race and retention regressions", () => {
  it("does not resurrect a deleted project when an older list finishes", async () => {
    const project = { id: "project-1" } as Project;
    let finish!: (projects: Project[]) => void;
    vi.stubGlobal("window", { launchStack: { projects: {
      getProjects: () => new Promise<Project[]>((resolve) => { finish = resolve; }),
      deleteProject: vi.fn().mockResolvedValue(undefined),
    } } });
    useProjectsStore.setState({ projects: [project] });
    const pending = useProjectsStore.getState().loadProjects();
    await useProjectsStore.getState().deleteProject(project.id);
    finish([project]);
    await pending;
    expect(useProjectsStore.getState().projects).toEqual([]);
    expect(useProjectsStore.getState().loading).toBe(false);
  });

  it("ignores an in-flight mutation after switching accounts", async () => {
    let finish!: (project: Project) => void;
    vi.stubGlobal("window", { launchStack: { projects: {
      toggleFavorite: () => new Promise<Project>((resolve) => { finish = resolve; }),
    } } });
    const pending = useProjectsStore.getState().toggleFavorite("old-account-project");
    useProjectsStore.getState().resetProjects();
    finish({ id: "old-account-project" } as Project);
    await pending;
    expect(useProjectsStore.getState().projects).toEqual([]);
  });

  it("bounds both retained log objects and events, including oversized messages", () => {
    const push = useLogsStore.getState().pushEvent;
    const event = { projectId: "project", kind: "stdout", message: "x".repeat(30_000), timestamp: new Date().toISOString() };
    for (let run = 0; run < 25; run++) {
      for (let line = 0; line < 510; line++) push({ ...event, runId: `run-${run}` } as RunEvent);
    }
    const state = useLogsStore.getState();
    expect(Object.keys(state.runs)).toHaveLength(18);
    expect(state.order).toHaveLength(18);
    expect(state.runs["run-24"]!.events).toHaveLength(500);
    expect(state.runs["run-24"]!.events[0]!.message.length).toBeLessThan(8300);
  });
});

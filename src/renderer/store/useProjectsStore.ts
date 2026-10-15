import { create } from "zustand";
import type {
  BulkImportCandidate,
  CreateProjectInput,
  DetectionResult,
  Project,
  ProjectUpdateInput,
} from "../../main/types/shared";
type ProjectsState = {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  initialized: boolean;
  loadProjects: () => Promise<Project[]>;
  loadProject: (id: string) => Promise<Project | null>;
  scanFolder: (path: string) => Promise<DetectionResult>;
  scanWorkspace: (path: string) => Promise<BulkImportCandidate[]>;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  bulkImportProjects: (inputs: CreateProjectInput[]) => Promise<Project[]>;
  updateProject: (id: string, patch: ProjectUpdateInput) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<Project>;
  setCurrentProject: (project: Project | null) => void;
  resetProjects: () => void;
};
function upsertProject(projects: Project[], project: Project): Project[] {
  return [project, ...projects.filter((entry) => entry.id !== project.id)];
}
let revision = 0;
let accountRevision = 0;
let listRequest = 0;
let detailRequest = 0;
export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  currentProject: null,
  loading: false,
  initialized: false,
  loadProjects: async () => {
    const request = ++listRequest;
    const snapshot = revision;
    set({ loading: true });
    try {
      const projects = await window.launchStack.projects.getProjects();
      if (request === listRequest && snapshot === revision) set({ projects, loading: false, initialized: true });
      else if (request === listRequest) set({ loading: false });
      return projects;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  loadProject: async (id) => {
    const request = ++detailRequest;
    const snapshot = revision;
    set({ loading: true });
    try {
      const project = await window.launchStack.projects.getProject(id);
      if (request === detailRequest && snapshot === revision) set((state) => ({
        currentProject: project,
        projects: project
          ? upsertProject(state.projects, project)
          : state.projects,
        loading: false,
        initialized: true,
      }));
      else if (request === detailRequest) set({ loading: false });
      return project;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  scanFolder: async (path) => {
    return window.launchStack.projects.scanFolder(path);
  },
  scanWorkspace: async (path) => {
    return window.launchStack.projects.scanWorkspace(path);
  },
  createProject: async (input) => {
    revision++;
    const account = accountRevision;
    const project = await window.launchStack.projects.createProject(input);
    revision++;
    if (account !== accountRevision) return project;
    set((state) => ({
      projects: upsertProject(state.projects, project),
      currentProject: project,
    }));
    return project;
  },
  bulkImportProjects: async (inputs) => {
    revision++;
    const account = accountRevision;
    const projects =
      await window.launchStack.projects.bulkImportProjects(inputs);
    revision++;
    if (account !== accountRevision) return projects;
    set((state) => ({
      projects: [
        ...projects,
        ...state.projects.filter(
          (project) => !projects.some((entry) => entry.id === project.id),
        ),
      ],
      currentProject: projects[0] ?? state.currentProject,
    }));
    return projects;
  },
  updateProject: async (id, patch) => {
    revision++;
    const account = accountRevision;
    const project = await window.launchStack.projects.updateProject(id, patch);
    revision++;
    if (account !== accountRevision) return project;
    set((state) => ({
      projects: upsertProject(state.projects, project),
      currentProject:
        state.currentProject?.id === id ? project : state.currentProject,
    }));
    return project;
  },
  deleteProject: async (id) => {
    revision++;
    const account = accountRevision;
    await window.launchStack.projects.deleteProject(id);
    revision++;
    if (account !== accountRevision) return;
    set((state) => ({
      projects: state.projects.filter((project) => project.id !== id),
      currentProject:
        state.currentProject?.id === id ? null : state.currentProject,
    }));
  },
  toggleFavorite: async (id) => {
    revision++;
    const account = accountRevision;
    const project = await window.launchStack.projects.toggleFavorite(id);
    revision++;
    if (account !== accountRevision) return project;
    set((state) => ({
      projects: upsertProject(state.projects, project),
      currentProject:
        state.currentProject?.id === id ? project : state.currentProject,
    }));
    return project;
  },
  setCurrentProject: (project) => {
    detailRequest++;
    set({ currentProject: project });
  },
  resetProjects: () => {
    revision++;
    accountRevision++;
    listRequest++;
    detailRequest++;
    set({
      projects: [],
      currentProject: null,
      loading: false,
      initialized: false,
    });
  },
}));

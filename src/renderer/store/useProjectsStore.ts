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
export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  currentProject: null,
  loading: false,
  initialized: false,
  loadProjects: async () => {
    set({ loading: true });
    try {
      const projects = await window.launchStack.projects.getProjects();
      set({ projects, loading: false, initialized: true });
      return projects;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  loadProject: async (id) => {
    set({ loading: true });
    try {
      const project = await window.launchStack.projects.getProject(id);
      set((state) => ({
        currentProject: project,
        projects: project
          ? upsertProject(state.projects, project)
          : state.projects,
        loading: false,
        initialized: true,
      }));
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
    const project = await window.launchStack.projects.createProject(input);
    set((state) => ({
      projects: upsertProject(state.projects, project),
      currentProject: project,
    }));
    return project;
  },
  bulkImportProjects: async (inputs) => {
    const projects =
      await window.launchStack.projects.bulkImportProjects(inputs);
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
    const project = await window.launchStack.projects.updateProject(id, patch);
    set((state) => ({
      projects: upsertProject(state.projects, project),
      currentProject:
        state.currentProject?.id === id ? project : state.currentProject,
    }));
    return project;
  },
  deleteProject: async (id) => {
    await window.launchStack.projects.deleteProject(id);
    set((state) => ({
      projects: state.projects.filter((project) => project.id !== id),
      currentProject:
        state.currentProject?.id === id ? null : state.currentProject,
    }));
  },
  toggleFavorite: async (id) => {
    const project = await window.launchStack.projects.toggleFavorite(id);
    set((state) => ({
      projects: upsertProject(state.projects, project),
      currentProject:
        state.currentProject?.id === id ? project : state.currentProject,
    }));
    return project;
  },
  setCurrentProject: (project) => {
    set({ currentProject: project });
  },
  resetProjects: () => {
    set({
      projects: [],
      currentProject: null,
      loading: false,
      initialized: false,
    });
  },
}));

import { useEffect, useMemo, useState } from "react";
import type { CommandSafetySummary, Project } from "../../main/types/shared";
export function useCommandSafetySummaries(
  projects: Project[],
): Record<string, CommandSafetySummary[]> {
  const [summaries, setSummaries] = useState<
    Record<string, CommandSafetySummary[]>
  >({});
  const projectSignature = useMemo(
    () =>
      projects
        .map(
          (project) =>
            `${project.id}:${project.updatedAt}:${project.commands.length}`,
        )
        .join("|"),
    [projects],
  );
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      if (projects.length === 0) {
        setSummaries({});
        return;
      }
      const entries = await Promise.all(
        projects.map(async (project) => {
          try {
            return [
              project.id,
              await window.launchStack.launcher.getCommandSafety(project.id),
            ] as const;
          } catch {
            return [project.id, []] as const;
          }
        }),
      );
      if (!cancelled) {
        setSummaries(Object.fromEntries(entries));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectSignature, projects]);
  return summaries;
}

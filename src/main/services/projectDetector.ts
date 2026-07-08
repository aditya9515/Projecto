import type {
  DetectionResult,
  DetectedType,
  SuggestedCommand,
} from "../types/shared";

export type ProjectScanSnapshot = {
  rootPath: string;
  entries: string[];
  entryKinds: Record<string, "file" | "directory">;
  fileContents: Record<string, string | undefined>;
  packageJson: Record<string, unknown> | undefined;
};

type DetectionContribution = {
  detectedType: Exclude<DetectedType, "fullstack" | "unknown">;
  framework?: string;
  packageManager?: string;
  suggestedCommands: SuggestedCommand[];
  suggestedBrowserUrls: string[];
};

const NODE_LOCKFILE_MAP: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
};

function hasConfig(entries: string[], prefix: string): boolean {
  return entries.some((entry) => entry.startsWith(prefix));
}

function getPackageManager(snapshot: ProjectScanSnapshot): string | undefined {
  const packageManagerField = snapshot.packageJson?.packageManager;

  if (
    typeof packageManagerField === "string" &&
    packageManagerField.trim().length > 0
  ) {
    return packageManagerField.split("@")[0];
  }

  for (const [filename, packageManager] of Object.entries(NODE_LOCKFILE_MAP)) {
    if (snapshot.entries.includes(filename)) {
      return packageManager;
    }
  }

  return snapshot.entries.includes("package.json") ? "npm" : undefined;
}

function getNodeScripts(
  snapshot: ProjectScanSnapshot,
): Record<string, unknown> {
  const scripts = snapshot.packageJson?.scripts;
  return typeof scripts === "object" && scripts !== null
    ? (scripts as Record<string, unknown>)
    : {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function createNodeCommands(
  rootPath: string,
  packageManager: string | undefined,
  includeDevCommand: boolean,
  includeStartCommand: boolean,
): SuggestedCommand[] {
  const installCommand =
    packageManager === "pnpm"
      ? "pnpm install"
      : packageManager === "yarn"
        ? "yarn install"
        : "npm install";

  const devCommand =
    packageManager === "pnpm"
      ? "pnpm dev"
      : packageManager === "yarn"
        ? "yarn dev"
        : "npm run dev";

  const startCommand =
    packageManager === "pnpm"
      ? "pnpm start"
      : packageManager === "yarn"
        ? "yarn start"
        : "npm run start";

  const commands: SuggestedCommand[] = [
    {
      label: "Install dependencies",
      command: installCommand,
      cwd: rootPath,
    },
  ];

  if (includeDevCommand) {
    commands.push({
      label: "Development server",
      command: devCommand,
      cwd: rootPath,
    });
  } else if (includeStartCommand) {
    commands.push({
      label: "Start app",
      command: startCommand,
      cwd: rootPath,
    });
  }

  return commands;
}

function detectNode(
  snapshot: ProjectScanSnapshot,
): DetectionContribution | undefined {
  const hasNodeSignals =
    snapshot.entries.includes("package.json") ||
    Object.keys(NODE_LOCKFILE_MAP).some((filename) =>
      snapshot.entries.includes(filename),
    ) ||
    snapshot.entries.includes("tsconfig.json") ||
    hasConfig(snapshot.entries, "vite.config.") ||
    hasConfig(snapshot.entries, "next.config.");

  if (!hasNodeSignals) {
    return undefined;
  }

  const dependencies = {
    ...asRecord(snapshot.packageJson?.dependencies),
    ...asRecord(snapshot.packageJson?.devDependencies),
  };

  const scripts = getNodeScripts(snapshot);
  const packageManager = getPackageManager(snapshot);
  const hasDevScript = typeof scripts.dev === "string";
  const hasStartScript = typeof scripts.start === "string";

  let framework = "Node.js";
  const urls: string[] = [];

  if ("next" in dependencies || hasConfig(snapshot.entries, "next.config.")) {
    framework = "Next.js";
    urls.push("http://localhost:3000");
  } else if (
    "vite" in dependencies ||
    hasConfig(snapshot.entries, "vite.config.")
  ) {
    framework = "Vite";
    urls.push("http://localhost:5173");
  } else if ("react-scripts" in dependencies) {
    framework = "React";
    urls.push("http://localhost:3000");
  } else if (snapshot.entries.includes("tsconfig.json")) {
    framework = "TypeScript";
  }

  return {
    detectedType: "node",
    framework,
    packageManager,
    suggestedCommands: createNodeCommands(
      snapshot.rootPath,
      packageManager,
      hasDevScript || framework === "Next.js" || framework === "Vite",
      hasStartScript,
    ),
    suggestedBrowserUrls: urls,
  };
}

function getPythonPackageManager(
  snapshot: ProjectScanSnapshot,
): string | undefined {
  if (snapshot.entries.includes("uv.lock")) {
    return "uv";
  }

  if (snapshot.entries.includes("poetry.lock")) {
    return "poetry";
  }

  if (snapshot.entries.includes("Pipfile")) {
    return "pipenv";
  }

  if (
    snapshot.entries.includes("requirements.txt") ||
    snapshot.entries.includes("pyproject.toml")
  ) {
    return "pip";
  }

  return undefined;
}

function getPythonContent(snapshot: ProjectScanSnapshot): string {
  return [snapshot.fileContents["main.py"], snapshot.fileContents["app.py"]]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

function createPythonCommands(
  rootPath: string,
  packageManager: string | undefined,
  framework: string,
): SuggestedCommand[] {
  const installCommand =
    packageManager === "uv"
      ? "uv sync"
      : packageManager === "poetry"
        ? "poetry install"
        : packageManager === "pipenv"
          ? "pipenv install"
          : "pip install -r requirements.txt";

  const devCommand =
    framework === "FastAPI"
      ? packageManager === "uv"
        ? "uv run uvicorn main:app --reload"
        : packageManager === "poetry"
          ? "poetry run uvicorn main:app --reload"
          : packageManager === "pipenv"
            ? "pipenv run uvicorn main:app --reload"
            : "uvicorn main:app --reload"
      : framework === "Flask"
        ? packageManager === "uv"
          ? "uv run flask run"
          : packageManager === "poetry"
            ? "poetry run flask run"
            : packageManager === "pipenv"
              ? "pipenv run flask run"
              : "flask run"
        : packageManager === "uv"
          ? "uv run python main.py"
          : packageManager === "poetry"
            ? "poetry run python main.py"
            : packageManager === "pipenv"
              ? "pipenv run python main.py"
              : "python main.py";

  return [
    {
      label: "Install dependencies",
      command: installCommand,
      cwd: rootPath,
    },
    {
      label:
        framework === "Flask"
          ? "Flask server"
          : framework === "FastAPI"
            ? "FastAPI server"
            : "Run app",
      command: devCommand,
      cwd: rootPath,
    },
  ];
}

function detectPython(
  snapshot: ProjectScanSnapshot,
): DetectionContribution | undefined {
  const hasSignals =
    snapshot.entries.includes("requirements.txt") ||
    snapshot.entries.includes("pyproject.toml") ||
    snapshot.entries.includes("Pipfile") ||
    snapshot.entries.includes("poetry.lock") ||
    snapshot.entries.includes("uv.lock") ||
    snapshot.entries.includes("main.py") ||
    snapshot.entries.includes("app.py");

  if (!hasSignals) {
    return undefined;
  }

  const content = getPythonContent(snapshot);
  const packageManager = getPythonPackageManager(snapshot);

  let framework = "Python";
  const urls: string[] = [];

  if (
    /from\s+fastapi\s+import/i.test(content) ||
    /FastAPI\s*\(/i.test(content)
  ) {
    framework = "FastAPI";
    urls.push("http://127.0.0.1:8000/docs");
  } else if (
    /from\s+flask\s+import/i.test(content) ||
    /Flask\s*\(/i.test(content)
  ) {
    framework = "Flask";
    urls.push("http://127.0.0.1:5000");
  }

  return {
    detectedType: "python",
    framework,
    packageManager,
    suggestedCommands: createPythonCommands(
      snapshot.rootPath,
      packageManager,
      framework,
    ),
    suggestedBrowserUrls: urls,
  };
}

function detectRust(
  snapshot: ProjectScanSnapshot,
): DetectionContribution | undefined {
  if (!snapshot.entries.includes("Cargo.toml")) {
    return undefined;
  }

  return {
    detectedType: "rust",
    framework: "Rust",
    packageManager: "cargo",
    suggestedCommands: [
      {
        label: "Build project",
        command: "cargo build",
        cwd: snapshot.rootPath,
      },
      {
        label: "Run project",
        command: "cargo run",
        cwd: snapshot.rootPath,
      },
    ],
    suggestedBrowserUrls: [],
  };
}

function detectDocker(
  snapshot: ProjectScanSnapshot,
): DetectionContribution | undefined {
  const hasDockerfile = snapshot.entries.includes("Dockerfile");
  const hasCompose =
    snapshot.entries.includes("docker-compose.yml") ||
    snapshot.entries.includes("compose.yaml");

  if (!hasDockerfile && !hasCompose) {
    return undefined;
  }

  return {
    detectedType: "docker",
    framework: hasCompose ? "Docker Compose" : "Docker",
    packageManager: "docker",
    suggestedCommands: [
      {
        label: hasCompose ? "Docker compose up" : "Docker build",
        command: hasCompose ? "docker compose up" : "docker build .",
        cwd: snapshot.rootPath,
      },
    ],
    suggestedBrowserUrls: [],
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function dedupeCommands(commands: SuggestedCommand[]): SuggestedCommand[] {
  const seen = new Set<string>();
  const result: SuggestedCommand[] = [];

  for (const command of commands) {
    const key = `${command.label}::${command.command}::${command.cwd}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(command);
    }
  }

  return result;
}

function joinFrameworks(frameworks: string[]): string | undefined {
  const uniqueFrameworks = unique(frameworks.filter(Boolean));
  return uniqueFrameworks.length > 0 ? uniqueFrameworks.join(" + ") : undefined;
}

function joinPackageManagers(packageManagers: string[]): string | undefined {
  const uniqueManagers = unique(packageManagers.filter(Boolean));
  return uniqueManagers.length > 0 ? uniqueManagers.join(" / ") : undefined;
}

export class ProjectDetector {
  detect(snapshot: ProjectScanSnapshot): DetectionResult {
    const contributors = [
      detectNode(snapshot),
      detectPython(snapshot),
      detectRust(snapshot),
      detectDocker(snapshot),
    ].filter((value): value is DetectionContribution => value !== undefined);

    const primaryContributors = contributors.filter(
      (contributor) =>
        contributor.detectedType === "node" ||
        contributor.detectedType === "python" ||
        contributor.detectedType === "rust",
    );

    let detectedType: DetectedType = "unknown";

    if (primaryContributors.length > 1) {
      detectedType = "fullstack";
    } else if (primaryContributors.length === 1) {
      const primaryContributor = primaryContributors[0];

      if (primaryContributor) {
        detectedType = primaryContributor.detectedType;
      }
    } else if (
      contributors.some((contributor) => contributor.detectedType === "docker")
    ) {
      detectedType = "docker";
    }

    const framework = joinFrameworks(
      contributors.map((contributor) => contributor.framework ?? ""),
    );
    const packageManager = joinPackageManagers(
      primaryContributors.length > 0
        ? primaryContributors.map(
            (contributor) => contributor.packageManager ?? "",
          )
        : contributors.map((contributor) => contributor.packageManager ?? ""),
    );

    return {
      detectedType,
      framework,
      packageManager,
      detectedFiles: snapshot.entries
        .filter((entry) => {
          if (entry === ".git") {
            return snapshot.entryKinds[entry] === "directory";
          }

          return (
            entry === "package.json" ||
            entry === "package-lock.json" ||
            entry === "pnpm-lock.yaml" ||
            entry === "yarn.lock" ||
            entry === "tsconfig.json" ||
            entry === "requirements.txt" ||
            entry === "pyproject.toml" ||
            entry === "Pipfile" ||
            entry === "poetry.lock" ||
            entry === "uv.lock" ||
            entry === "main.py" ||
            entry === "app.py" ||
            entry === "Dockerfile" ||
            entry === "docker-compose.yml" ||
            entry === "compose.yaml" ||
            entry === "Cargo.toml" ||
            entry.startsWith("vite.config.") ||
            entry.startsWith("next.config.")
          );
        })
        .sort((left, right) => left.localeCompare(right)),
      suggestedCommands: dedupeCommands(
        contributors.flatMap((contributor) => contributor.suggestedCommands),
      ),
      suggestedBrowserUrls: unique(
        contributors.flatMap((contributor) => contributor.suggestedBrowserUrls),
      ),
    };
  }
}

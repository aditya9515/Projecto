import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemService } from "../fileSystemService";
import { ProjectDetector } from "../projectDetector";
import { ProjectScanner } from "../projectScanner";

type FixtureDirectory = {
  [key: string]: FixtureEntry;
};

type FixtureEntry = string | FixtureDirectory;

const tempDirs: string[] = [];

async function createTempWorkspace(
  name: string,
  structure: Record<string, FixtureEntry>,
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `launchstack-${name}-`));
  tempDirs.push(root);
  await writeStructure(root, structure);
  return root;
}

async function writeStructure(
  root: string,
  structure: Record<string, FixtureEntry>,
): Promise<void> {
  await Promise.all(
    Object.entries(structure).map(async ([name, value]) => {
      const targetPath = path.join(root, name);

      if (typeof value === "string") {
        await fs.writeFile(targetPath, value, "utf8");
        return;
      }

      await fs.mkdir(targetPath, { recursive: true });
      await writeStructure(targetPath, value);
    }),
  );
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("ProjectScanner", () => {
  const scanner = new ProjectScanner(
    new FileSystemService(),
    new ProjectDetector(),
  );

  it("detects a Vite project with npm conventions", async () => {
    const workspace = await createTempWorkspace("vite", {
      "package.json": JSON.stringify({
        name: "vite-app",
        scripts: { dev: "vite" },
        devDependencies: { vite: "^5.0.0" },
        dependencies: { react: "^18.0.0" },
      }),
      "package-lock.json": "{}",
      "vite.config.ts": "export default {}",
      "tsconfig.json": "{}",
      ".git": {},
    });

    const result = await scanner.scanFolder(workspace);

    expect(result.detectedType).toBe("node");
    expect(result.framework).toBe("Vite");
    expect(result.packageManager).toBe("npm");
    expect(result.detectedFiles).toEqual(
      expect.arrayContaining([
        ".git",
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        "tsconfig.json",
      ]),
    );
    expect(result.suggestedBrowserUrls).toContain("http://localhost:5173");
    expect(
      result.suggestedCommands.map((command) => command.command),
    ).toContain("npm run dev");
  });

  it("detects a Next.js project", async () => {
    const workspace = await createTempWorkspace("next", {
      "package.json": JSON.stringify({
        name: "next-app",
        scripts: { dev: "next dev" },
        dependencies: { next: "^15.0.0", react: "^18.0.0" },
      }),
      "pnpm-lock.yaml": "lockfileVersion: 9.0",
      "next.config.mjs": "export default {}",
    });

    const result = await scanner.scanFolder(workspace);

    expect(result.detectedType).toBe("node");
    expect(result.framework).toBe("Next.js");
    expect(result.packageManager).toBe("pnpm");
    expect(result.suggestedBrowserUrls).toContain("http://localhost:3000");
    expect(
      result.suggestedCommands.map((command) => command.command),
    ).toContain("pnpm dev");
  });

  it("detects FastAPI projects using file content heuristics", async () => {
    const workspace = await createTempWorkspace("fastapi", {
      "requirements.txt": "fastapi\nuvicorn\n",
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    });

    const result = await scanner.scanFolder(workspace);

    expect(result.detectedType).toBe("python");
    expect(result.framework).toBe("FastAPI");
    expect(result.suggestedBrowserUrls).toContain("http://127.0.0.1:8000/docs");
    expect(
      result.suggestedCommands.map((command) => command.command),
    ).toContain("uvicorn main:app --reload");
  });

  it("detects Flask projects using file content heuristics", async () => {
    const workspace = await createTempWorkspace("flask", {
      Pipfile: '[packages]\nflask="*"\n',
      "app.py": "from flask import Flask\napp = Flask(__name__)\n",
    });

    const result = await scanner.scanFolder(workspace);

    expect(result.detectedType).toBe("python");
    expect(result.framework).toBe("Flask");
    expect(result.packageManager).toBe("pipenv");
    expect(
      result.suggestedCommands.map((command) => command.command),
    ).toContain("pipenv run flask run");
  });

  it("detects Rust projects", async () => {
    const workspace = await createTempWorkspace("rust", {
      "Cargo.toml": '[package]\nname="tool"\nversion="0.1.0"\n',
    });

    const result = await scanner.scanFolder(workspace);

    expect(result.detectedType).toBe("rust");
    expect(result.framework).toBe("Rust");
    expect(
      result.suggestedCommands.map((command) => command.command),
    ).toContain("cargo run");
  });

  it("detects Docker-only projects without marking them fullstack", async () => {
    const workspace = await createTempWorkspace("docker", {
      Dockerfile: "FROM node:20",
      "docker-compose.yml": "services:\n  web:\n    build: .\n",
    });

    const result = await scanner.scanFolder(workspace);

    expect(result.detectedType).toBe("docker");
    expect(result.framework).toBe("Docker Compose");
    expect(
      result.suggestedCommands.map((command) => command.command),
    ).toContain("docker compose up");
  });

  it("marks mixed primary runtimes as fullstack", async () => {
    const workspace = await createTempWorkspace("fullstack", {
      "package.json": JSON.stringify({
        name: "api-ui",
        scripts: { dev: "vite" },
        devDependencies: { vite: "^5.0.0" },
      }),
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
      "requirements.txt": "fastapi\nuvicorn\n",
    });

    const result = await scanner.scanFolder(workspace);

    expect(result.detectedType).toBe("fullstack");
    expect(result.framework).toContain("Vite");
    expect(result.framework).toContain("FastAPI");
    expect(result.suggestedCommands.length).toBeGreaterThanOrEqual(3);
  });

  it("returns unknown for unrecognized folders", async () => {
    const workspace = await createTempWorkspace("unknown", {
      "README.md": "# Notes",
    });

    const result = await scanner.scanFolder(workspace);

    expect(result.detectedType).toBe("unknown");
    expect(result.detectedFiles).toEqual([]);
    expect(result.suggestedCommands).toEqual([]);
  });
});

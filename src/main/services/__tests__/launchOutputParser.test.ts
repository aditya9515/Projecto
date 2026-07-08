import { describe, expect, it } from "vitest";

import {
  detectLaunchOutputSignals,
  extractPortFromUrl,
  normalizeDiscoveredUrl,
} from "../launchOutputParser";

describe("launchOutputParser", () => {
  it("parses and prefers local frontend URLs", () => {
    const signals = detectLaunchOutputSignals(
      [
        "Network: http://192.168.1.20:5173/",
        "Local: http://localhost:3002",
      ].join("\n"),
    );

    expect(signals.urls.map((entry) => entry.url)).toEqual([
      "http://localhost:3002/",
      "http://192.168.1.20:5173/",
    ]);
    expect(signals.ports.map((entry) => entry.port)).toEqual([5173, 3002]);
  });

  it("normalizes host and trailing punctuation", () => {
    expect(normalizeDiscoveredUrl("http://0.0.0.0:5173).")).toBe(
      "http://localhost:5173/",
    );
  });

  it("recognizes IPv6 localhost URLs as local app URLs", () => {
    const signals = detectLaunchOutputSignals("Local: http://[::1]:5173/");

    expect(signals.urls[0]?.url).toBe("http://[::1]:5173/");
    expect(signals.ports[0]).toEqual(
      expect.objectContaining({
        host: "[::1]",
        port: 5173,
      }),
    );
  });

  it("parses Windows PowerShell mirrored output with NUL-separated characters", () => {
    const nulSeparated = [
      "Port 3000 is in use by process 17328, using available port 3001 instead.",
      "- Local:        http://localhost:3001",
      "- Network:      http://10.229.189.152:3001",
    ]
      .join("\n")
      .split("")
      .join("\0");
    const signals = detectLaunchOutputSignals(nulSeparated);

    expect(signals.portFallback).toEqual({
      requestedPort: "3000",
      selectedPort: "3001",
      processId: "17328",
    });
    expect(signals.urls.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        "http://localhost:3001/",
        "http://10.229.189.152:3001/",
      ]),
    );
    expect(signals.ports.map((entry) => entry.port)).toEqual(
      expect.arrayContaining([3001]),
    );
  });

  it("detects Next.js port fallback and lock errors without changing run status", () => {
    const signals = detectLaunchOutputSignals(
      [
        "Port 3000 is in use by process 35060, using available port 3002 instead.",
        "Local: http://localhost:3002",
        "Unable to acquire lock at D:\\projects\\app\\.next\\dev\\lock, is another instance of next dev running?",
      ].join("\n"),
    );

    expect(signals.portFallback).toEqual({
      requestedPort: "3000",
      selectedPort: "3002",
      processId: "35060",
    });
    expect(signals.nextLockError).toBe(true);
    expect(signals.urls[0]?.url).toBe("http://localhost:3002/");
    expect(signals.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          port: 3002,
          host: "localhost",
          url: "http://localhost:3002/",
        }),
      ]),
    );
  });

  it("creates a provisional localhost URL from a port fallback before the app prints Local", () => {
    const signals = detectLaunchOutputSignals(
      "Port 3000 is in use by process 34332, using available port 3003 instead.",
    );

    expect(signals.portFallback).toEqual({
      requestedPort: "3000",
      selectedPort: "3003",
      processId: "34332",
    });
    expect(signals.urls[0]?.url).toBe("http://localhost:3003/");
    expect(signals.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          port: 3003,
          host: "localhost",
          source: "port-remap",
        }),
      ]),
    );
  });

  it("detects common dev-server URL formats", () => {
    const signals = detectLaunchOutputSignals(
      [
        "VITE v5 ready",
        "  ➜  Local:   http://localhost:5173/",
        "  - Local:        http://localhost:3000",
        "Compiled successfully! You can now view app in the browser.",
        "  Local:            http://localhost:3001",
        "Astro  ready in 120ms",
        "  Local  http://localhost:4321/",
        "SvelteKit dev server running at http://localhost:5174",
        "Angular Live Development Server is listening on localhost:4200, open your browser on http://localhost:4200/",
        " * Running on http://127.0.0.1:5000",
        "Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)",
        "docker: mapped to http://0.0.0.0:8080",
      ].join("\n"),
    );

    expect(signals.urls.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        "http://localhost:5173/",
        "http://localhost:3000/",
        "http://localhost:3001/",
        "http://localhost:4321/",
        "http://localhost:5174/",
        "http://localhost:4200/",
        "http://127.0.0.1:5000/",
        "http://127.0.0.1:8000/",
        "http://localhost:8080/",
      ]),
    );
    expect(signals.ports.map((entry) => entry.port)).toEqual(
      expect.arrayContaining([
        5173, 3000, 3001, 4321, 5174, 4200, 5000, 8000, 8080,
      ]),
    );
  });

  it("extracts implicit and explicit URL ports", () => {
    expect(extractPortFromUrl("http://localhost")).toEqual({
      host: "localhost",
      port: 80,
    });
    expect(extractPortFromUrl("https://localhost/app")).toEqual({
      host: "localhost",
      port: 443,
    });
    expect(extractPortFromUrl("http://127.0.0.1:5173")).toEqual({
      host: "127.0.0.1",
      port: 5173,
    });
  });
});

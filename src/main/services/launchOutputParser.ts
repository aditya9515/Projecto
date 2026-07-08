export type DetectedLaunchUrl = {
  url: string;
  source: "local" | "network" | "generic";
};

export type DetectedLaunchPort = {
  port: number;
  host: string;
  url?: string;
  source: DetectedLaunchUrl["source"] | "port-remap";
};

export type PortFallbackSignal = {
  requestedPort: string;
  selectedPort: string;
  processId?: string;
};

export type LaunchOutputSignals = {
  urls: DetectedLaunchUrl[];
  ports: DetectedLaunchPort[];
  portFallback?: PortFallbackSignal;
  nextLockError: boolean;
};

const ANSI_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
  "g",
);
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const PORT_FALLBACK_PATTERN =
  /Port\s+(\d+)\s+is in use(?:\s+by process\s+(\d+))?[\s\S]*?using available port\s+(\d+)\s+instead/i;
const NEXT_LOCK_PATTERNS = [
  /Unable to acquire lock at .*[\\/]\.next[\\/]dev[\\/]lock/i,
  /is another instance of next dev running\?/i,
];

export function stripAnsi(value: string): string {
  return value.replace(/\0/g, "").replace(ANSI_PATTERN, "");
}

export function normalizeDiscoveredUrl(rawUrl: string): string | null {
  const trimmed = stripAnsi(rawUrl).replace(/[)\],.;]+$/g, "");

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "0.0.0.0" || hostname === "::" || hostname === "[::]") {
      parsed.hostname = "localhost";
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function isLikelyAppUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

export function extractPortFromUrl(
  value: string,
): { port: number; host: string } | null {
  try {
    const parsed = new URL(value);
    const explicitPort = parsed.port ? Number(parsed.port) : undefined;
    const port =
      explicitPort ??
      (parsed.protocol === "https:"
        ? 443
        : parsed.protocol === "http:"
          ? 80
          : undefined);

    if (!port || !Number.isInteger(port) || port < 1 || port > 65_535) {
      return null;
    }

    return {
      port,
      host: parsed.hostname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function detectLaunchOutputSignals(output: string): LaunchOutputSignals {
  const text = stripAnsi(output);
  const urls = new Map<string, DetectedLaunchUrl>();

  for (const line of text.split(/\r?\n/)) {
    const source = /(^|\s)Local:/i.test(line)
      ? "local"
      : /(^|\s)Network:/i.test(line)
        ? "network"
        : "generic";

    for (const match of line.matchAll(URL_PATTERN)) {
      const normalized = normalizeDiscoveredUrl(match[0]);

      if (normalized && isLikelyAppUrl(normalized)) {
        urls.set(normalized, {
          url: normalized,
          source,
        });
      }
    }
  }

  const portFallbackMatch = text.match(PORT_FALLBACK_PATTERN);
  const portFallback =
    portFallbackMatch?.[1] && portFallbackMatch[3]
      ? {
          requestedPort: portFallbackMatch[1],
          selectedPort: portFallbackMatch[3],
          processId: portFallbackMatch[2],
        }
      : undefined;

  if (urls.size === 0 && portFallback) {
    const provisionalUrl = normalizeDiscoveredUrl(
      `http://localhost:${portFallback.selectedPort}`,
    );

    if (provisionalUrl) {
      urls.set(provisionalUrl, {
        url: provisionalUrl,
        source: "generic",
      });
    }
  }

  const ports = new Map<string, DetectedLaunchPort>();

  for (const detectedUrl of urls.values()) {
    const detectedPort = extractPortFromUrl(detectedUrl.url);

    if (!detectedPort) {
      continue;
    }

    ports.set(
      `${detectedPort.host}:${detectedPort.port}:${detectedUrl.url}`,
      {
        ...detectedPort,
        url: detectedUrl.url,
        source: detectedUrl.source,
      },
    );
  }

  if (portFallback?.selectedPort) {
    const port = Number(portFallback.selectedPort);

    if (Number.isInteger(port) && port > 0 && port <= 65_535) {
      const fallbackUrl = normalizeDiscoveredUrl(`http://localhost:${port}`);
      ports.set(`localhost:${port}:port-remap`, {
        port,
        host: "localhost",
        url: fallbackUrl ?? undefined,
        source: "port-remap",
      });
    }
  }

  return {
    urls: preferLocalUrls([...urls.values()]),
    ports: [...ports.values()],
    portFallback,
    nextLockError: NEXT_LOCK_PATTERNS.some((pattern) => pattern.test(text)),
  };
}

function preferLocalUrls(urls: DetectedLaunchUrl[]): DetectedLaunchUrl[] {
  return [...urls].sort(
    (left, right) => getUrlPriority(left) - getUrlPriority(right),
  );
}

function getUrlPriority(value: DetectedLaunchUrl): number {
  try {
    const hostname = new URL(value.url).hostname.toLowerCase();

    if (value.source === "local") {
      return 0;
    }

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    ) {
      return 1;
    }

    if (value.source === "generic") {
      return 2;
    }

    return 3;
  } catch {
    return 4;
  }
}
